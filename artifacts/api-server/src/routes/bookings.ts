import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { bookingsTable, customersTable, paymentsTable, expensesTable, tasksTable, staffTable, servicePackagesTable, packageItemsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray, or, ilike, sql, asc } from "drizzle-orm";
import { computeBookingEarnings } from "./job-earnings";

const router: IRouter = Router();

// ─── Task #55: Sanitize deductions ───────────────────────────────────────────
type DeductionItem = { label: string; amount: number };
function sanitizeDeductions(raw: unknown): DeductionItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as DeductionItem[])
    .filter(d => d?.label?.trim() && d.amount > 0)
    .map(({ label, amount }) => ({ label: String(label).trim(), amount: Number(amount) }));
}

// ─── Select fields shared across GET queries ──────────────────────────────────
const bookingFields = {
  id: bookingsTable.id,
  orderCode: bookingsTable.orderCode,
  customerId: bookingsTable.customerId,
  customerName: customersTable.name,
  customerPhone: customersTable.phone,
  shootDate: bookingsTable.shootDate,
  shootTime: bookingsTable.shootTime,
  serviceCategory: bookingsTable.serviceCategory,
  packageType: bookingsTable.packageType,
  location: bookingsTable.location,
  status: bookingsTable.status,
  items: bookingsTable.items,
  surcharges: bookingsTable.surcharges,
  totalAmount: bookingsTable.totalAmount,
  depositAmount: bookingsTable.depositAmount,
  paidAmount: bookingsTable.paidAmount,
  discountAmount: bookingsTable.discountAmount,
  assignedStaff: bookingsTable.assignedStaff,
  internalNotes: bookingsTable.internalNotes,
  notes: bookingsTable.notes,
  parentId: bookingsTable.parentId,
  serviceLabel: bookingsTable.serviceLabel,
  isParentContract: bookingsTable.isParentContract,
  photoCount: bookingsTable.photoCount,
  includedRetouchedPhotosSnapshot: bookingsTable.includedRetouchedPhotosSnapshot,
  servicePackageId: bookingsTable.servicePackageId,
  requiredRoles: bookingsTable.requiredRoles,
  deductions: bookingsTable.deductions,
  createdAt: bookingsTable.createdAt,
};

router.get("/bookings", async (req, res) => {
  try {
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const parentId = req.query.parentId ? parseInt(req.query.parentId as string) : undefined;
  // q === undefined  → not passed at all (main bookings list, no limit)
  // q === ""         → explicitly passed empty (?q=), return 10 most recent
  // q === "..."      → search term, return matching results
  const hasQParam = req.query.q !== undefined;
  const q = hasQParam ? (req.query.q as string).trim() : undefined;

  const searchCondition = q
    ? or(
        ilike(bookingsTable.orderCode, `%${q}%`),
        ilike(bookingsTable.serviceLabel, `%${q}%`),
        ilike(bookingsTable.packageType, `%${q}%`),
        ilike(customersTable.name, `%${q}%`),
        ilike(customersTable.phone, `%${q}%`),
      )
    : undefined;

  const baseQuery = db
    .select(bookingFields)
    .from(bookingsTable)
    .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(
      and(
        status ? eq(bookingsTable.status, status) : undefined,
        customerId ? eq(bookingsTable.customerId, customerId) : undefined,
        parentId ? eq(bookingsTable.parentId, parentId) : undefined,
        searchCondition,
      )
    )
    .orderBy(desc(bookingsTable.createdAt));

  // Only limit when ?q param was explicitly included in the URL but has no text
  // (= "show recent 10" mode for the booking-link dropdown)
  const rows = (hasQParam && !q)
    ? await baseQuery.limit(10)
    : await baseQuery;

  const allPayments = await db.select().from(paymentsTable);

  // Fetch all task rows for bookings (plain SELECT — aggregates done in code)
  const taskAggRows = await db
    .select({
      bookingId: tasksTable.bookingId,
      role: tasksTable.role,
      assigneeId: tasksTable.assigneeId,
    })
    .from(tasksTable)
    .where(sql`${tasksTable.bookingId} is not null`);

  // Build maps per booking
  const taskCountMap: Record<number, number> = {};
  const productionCostMap: Record<number, number> = {};
  const coveredRolesMap: Record<number, Set<string>> = {};

  for (const row of taskAggRows) {
    if (row.bookingId == null) continue;
    const bid = row.bookingId;
    taskCountMap[bid] = (taskCountMap[bid] ?? 0) + 1;
    if (!coveredRolesMap[bid]) coveredRolesMap[bid] = new Set();
    if (row.assigneeId != null && row.role) coveredRolesMap[bid].add(row.role);
  }

  // Sum productionCost separately using SQL aggregate
  const costAgg = await db
    .select({
      bookingId: tasksTable.bookingId,
      totalCost: sql<string>`coalesce(sum(${tasksTable.cost}), 0)::text`,
    })
    .from(tasksTable)
    .where(sql`${tasksTable.bookingId} is not null`)
    .groupBy(tasksTable.bookingId);

  for (const row of costAgg) {
    if (row.bookingId != null) productionCostMap[row.bookingId] = parseFloat(row.totalCost);
  }

  const bookings = rows.map((b) => {
    const bPayments = allPayments.filter(p => p.bookingId === b.id);
    const paidAmount = bPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalAmount = parseFloat(b.totalAmount);
    const discountAmt = parseFloat(b.discountAmount ?? "0");
    const productionCost = productionCostMap[b.id] ?? 0;
    return {
      ...b,
      totalAmount,
      depositAmount: parseFloat(b.depositAmount),
      paidAmount,
      discountAmount: discountAmt,
      remainingAmount: Math.max(0, totalAmount - discountAmt - paidAmount),
      taskCount: taskCountMap[b.id] ?? 0,
      productionCost,
      profit: totalAmount - discountAmt - productionCost,
      requiredRoles: (b.requiredRoles as string[]) ?? [],
      coveredRoles: [...(coveredRolesMap[b.id] ?? new Set<string>())],
    };
  });

  res.json(bookings);
  } catch (err) {
    console.error("GET /bookings error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.post("/bookings", async (req, res) => {
  try {
  const {
    customerId, shootDate, shootTime, serviceCategory, packageType, location,
    totalAmount, depositAmount, discountAmount, items, surcharges, notes, internalNotes,
    assignedStaff, parentId, serviceLabel, isParentContract, includedRetouchedPhotosSnapshot,
    // Deposit payment fields
    depositPaymentMethod, depositCollector,
    // Multi-service contract support
    subServices,
    // Task #24: link to package (tracking only)
    servicePackageId,
    // Task #55: deductions
    deductions,
  } = req.body;

  const depMethod    = depositPaymentMethod || "cash";
  const depCollector = depositCollector     || null;

  const count = await db.select().from(bookingsTable);
  const orderCode = `DH${String(count.length + 1).padStart(4, "0")}`;

  // ── Multi-service contract: create parent + children atomically ──
  if (subServices && Array.isArray(subServices) && subServices.length > 0) {
    // 1. Create parent contract booking
    const [parent] = await db
      .insert(bookingsTable)
      .values({
        orderCode,
        customerId,
        shootDate,       // contract/signing date
        shootTime: shootTime || "08:00",
        serviceCategory: serviceCategory || "wedding",
        packageType: packageType || `Hợp đồng ${subServices.length} dịch vụ`,
        location: location || null,
        totalAmount: String(totalAmount || 0),
        depositAmount: String(depositAmount || 0),
        discountAmount: String(discountAmount || 0),
        paidAmount: String(depositAmount || 0),
        items: [],
        surcharges: surcharges || [],
        deductions: [],
        notes: notes || null,
        internalNotes: internalNotes || null,
        assignedStaff: assignedStaff || {},
        isParentContract: true,
        status: "confirmed",
      })
      .returning();

    // 2. Create deposit payment for the parent contract
    if (depositAmount && parseFloat(String(depositAmount)) > 0) {
      await db.insert(paymentsTable).values({
        bookingId:     parent.id,
        amount:        String(depositAmount),
        paymentMethod: depMethod,
        paymentType:   "deposit",
        collectorName: depCollector,
        paidDate:      shootDate || null,
        notes:         "Cọc giữ lịch",
      });
    }

    // 3. Create child service bookings
    const children = [];
    for (let i = 0; i < subServices.length; i++) {
      const sub = subServices[i];
      const childCode = `${orderCode}-${i + 1}`;
      const [child] = await db
        .insert(bookingsTable)
        .values({
          orderCode: childCode,
          customerId,
          shootDate: sub.shootDate || shootDate,
          shootTime: sub.shootTime || "08:00",
          serviceCategory: serviceCategory || "wedding",
          packageType: sub.serviceLabel || sub.items?.[0]?.serviceName || `Dịch vụ ${i + 1}`,
          location: sub.location || location || null,
          totalAmount: String(sub.totalAmount || 0),
          depositAmount: "0",
          discountAmount: "0",
          paidAmount: "0",
          items: sub.items || [],
          surcharges: sub.surcharges || [],
          deductions: sanitizeDeductions(sub.deductions),
          notes: sub.notes || null,
          internalNotes: null,
          assignedStaff: sub.assignedStaff || {},
          parentId: parent.id,
          serviceLabel: sub.serviceLabel || null,
          isParentContract: false,
          status: sub.status || "confirmed",
        })
        .returning();
      children.push(child);
    }

    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
    res.status(201).json({
      ...parent,
      customerName: customer.name,
      customerPhone: customer.phone,
      totalAmount: parseFloat(parent.totalAmount),
      depositAmount: parseFloat(parent.depositAmount),
      paidAmount: parseFloat(parent.paidAmount),
      discountAmount: parseFloat(parent.discountAmount ?? "0"),
      remainingAmount: Math.max(0, parseFloat(parent.totalAmount) - parseFloat(parent.discountAmount ?? "0") - parseFloat(parent.paidAmount)),
      children: children.map(c => ({ ...c, totalAmount: parseFloat(c.totalAmount) })),
    });
    return;
  }

  // ── Single booking (existing behavior) ──

  // Task #24: nếu có servicePackageId, snapshot items + includedRetouchedPhotos từ package
  let snapshotItems = items || [];
  let snapshotRetouched = includedRetouchedPhotosSnapshot != null ? parseInt(String(includedRetouchedPhotosSnapshot)) : 0;
  if (servicePackageId) {
    const pkgId = parseInt(String(servicePackageId));
    const [pkg] = await db.select().from(servicePackagesTable).where(eq(servicePackagesTable.id, pkgId));
    if (pkg) {
      const pkgItems = await db.select().from(packageItemsTable).where(eq(packageItemsTable.packageId, pkgId)).orderBy(asc(packageItemsTable.sortOrder));
      if (pkgItems.length > 0 && snapshotItems.length === 0) snapshotItems = pkgItems;
      if (!includedRetouchedPhotosSnapshot) snapshotRetouched = (pkg as { includedRetouchedPhotos?: number }).includedRetouchedPhotos ?? 0;
    }
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      orderCode,
      customerId,
      shootDate,
      shootTime,
      serviceCategory: serviceCategory || "wedding",
      packageType,
      location,
      totalAmount: String(totalAmount),
      depositAmount: String(depositAmount || 0),
      discountAmount: String(discountAmount || 0),
      paidAmount: String(depositAmount || 0),
      items: snapshotItems,
      surcharges: surcharges || [],
      deductions: isParentContract ? [] : sanitizeDeductions(deductions),
      notes,
      internalNotes,
      assignedStaff: assignedStaff || [],
      parentId: parentId || null,
      serviceLabel: serviceLabel || null,
      isParentContract: isParentContract || false,
      includedRetouchedPhotosSnapshot: snapshotRetouched,
      servicePackageId: servicePackageId ? parseInt(String(servicePackageId)) : null,
      status: "pending",
    })
    .returning();

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));

  if (depositAmount && parseFloat(String(depositAmount)) > 0) {
    await db.insert(paymentsTable).values({
      bookingId:     booking.id,
      amount:        String(depositAmount),
      paymentMethod: depMethod,
      paymentType:   "deposit",
      collectorName: depCollector,
      paidDate:      shootDate || null,
      notes:         "Cọc giữ lịch",
    });
  }

  res.status(201).json({
    ...booking,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalAmount: parseFloat(booking.totalAmount),
    depositAmount: parseFloat(booking.depositAmount),
    paidAmount: parseFloat(booking.paidAmount),
    discountAmount: parseFloat(booking.discountAmount ?? "0"),
    remainingAmount: Math.max(0, parseFloat(booking.totalAmount) - parseFloat(booking.discountAmount ?? "0") - parseFloat(booking.paidAmount)),
  });
  } catch (err) {
    console.error("POST /bookings error:", err);
    res.status(500).json({ error: "Lỗi hệ thống khi tạo đơn hàng" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  try {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select(bookingFields)
    .from(bookingsTable)
    .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(eq(bookingsTable.id, id));

  if (!row) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.bookingId, id));
  const tasks = await db
    .select({
      id: tasksTable.id, title: tasksTable.title, category: tasksTable.category,
      status: tasksTable.status, priority: tasksTable.priority, dueDate: tasksTable.dueDate,
      assigneeId: tasksTable.assigneeId, assigneeName: staffTable.name,
      role: tasksTable.role, taskType: tasksTable.taskType,
      cost: tasksTable.cost,
    })
    .from(tasksTable)
    .leftJoin(staffTable, eq(tasksTable.assigneeId, staffTable.id))
    .where(eq(tasksTable.bookingId, id));

  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalAmount = parseFloat(row.totalAmount);
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
  const discountAmt = parseFloat(row.discountAmount ?? "0");
  const productionCost = tasks.reduce((s, t) => s + (t.cost != null ? parseFloat(t.cost as string) : 0), 0);
  const coveredRoles = [...new Set(tasks.filter(t => t.assigneeId != null && t.role).map(t => t.role as string))];

  // ── If this booking is a child (has parentId), fetch siblings + parent ──
  let siblings: unknown[] = [];
  let parentContract: unknown = null;

  if (row.parentId) {
    const siblingRows = await db
      .select(bookingFields)
      .from(bookingsTable)
      .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
      .where(and(eq(bookingsTable.parentId, row.parentId)))
      .orderBy(bookingsTable.shootDate);
    siblings = siblingRows.map(s => ({
      ...s,
      totalAmount: parseFloat(s.totalAmount),
      depositAmount: parseFloat(s.depositAmount),
    }));

    const [parentRow] = await db
      .select(bookingFields)
      .from(bookingsTable)
      .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
      .where(eq(bookingsTable.id, row.parentId));

    if (parentRow) {
      const parentPayments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, parentRow.id));
      const parentPaid = parentPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
      const parentTotal = parseFloat(parentRow.totalAmount);
      const parentDiscount = parseFloat(parentRow.discountAmount ?? "0");
      parentContract = {
        ...parentRow,
        totalAmount: parentTotal,
        depositAmount: parseFloat(parentRow.depositAmount),
        paidAmount: parentPaid,
        discountAmount: parentDiscount,
        remainingAmount: Math.max(0, parentTotal - parentDiscount - parentPaid),
      };
    }
  }

  // ── If this booking is the parent, fetch children ──
  let children: unknown[] = [];
  if (row.isParentContract) {
    const childRows = await db
      .select(bookingFields)
      .from(bookingsTable)
      .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
      .where(eq(bookingsTable.parentId, id))
      .orderBy(bookingsTable.shootDate);
    children = childRows.map(c => ({
      ...c,
      totalAmount: parseFloat(c.totalAmount),
      depositAmount: parseFloat(c.depositAmount),
    }));
  }

  res.json({
    ...row,
    totalAmount,
    depositAmount: parseFloat(row.depositAmount),
    paidAmount,
    discountAmount: parseFloat(row.discountAmount ?? "0"),
    remainingAmount: Math.max(0, totalAmount - parseFloat(row.discountAmount ?? "0") - paidAmount),
    totalExpenses,
    grossProfit: totalAmount - totalExpenses,
    payments: payments.map(p => ({ ...p, amount: parseFloat(p.amount) })),
    expenses: expenses.map(e => ({ ...e, amount: parseFloat(e.amount) })),
    tasks,
    siblings,
    parentContract,
    children,
  });
  } catch (err) {
    console.error("GET /bookings/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.put("/bookings/:id", async (req, res) => {
  try {
  const id = parseInt(req.params.id);
  const {
    shootDate, shootTime, serviceCategory, packageType, location, status,
    totalAmount, depositAmount, discountAmount, items, surcharges, notes, internalNotes,
    assignedStaff, parentId, serviceLabel, isParentContract, photoCount, includedRetouchedPhotosSnapshot,
    servicePackageId,
    // Task #55: deductions
    deductions,
  } = req.body;

  const updateData: Record<string, unknown> = {};
  if (shootDate !== undefined) updateData.shootDate = shootDate;
  if (shootTime !== undefined) updateData.shootTime = shootTime;
  if (serviceCategory !== undefined) updateData.serviceCategory = serviceCategory;
  if (packageType !== undefined) updateData.packageType = packageType;
  if (location !== undefined) updateData.location = location;
  if (status !== undefined) updateData.status = status;
  if (totalAmount !== undefined) updateData.totalAmount = String(totalAmount);
  if (depositAmount !== undefined) updateData.depositAmount = String(depositAmount);
  if (discountAmount !== undefined) updateData.discountAmount = String(discountAmount);
  if (items !== undefined) updateData.items = items;
  if (surcharges !== undefined) updateData.surcharges = surcharges;
  if (notes !== undefined) updateData.notes = notes;
  if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
  if (assignedStaff !== undefined) updateData.assignedStaff = assignedStaff;
  if (parentId !== undefined) updateData.parentId = parentId;
  if (serviceLabel !== undefined) updateData.serviceLabel = serviceLabel;
  if (isParentContract !== undefined) updateData.isParentContract = isParentContract;
  if (photoCount !== undefined) updateData.photoCount = photoCount !== null ? parseInt(String(photoCount)) : null;
  if (includedRetouchedPhotosSnapshot !== undefined) updateData.includedRetouchedPhotosSnapshot = parseInt(String(includedRetouchedPhotosSnapshot)) || 0;
  if (servicePackageId !== undefined) updateData.servicePackageId = servicePackageId ? parseInt(String(servicePackageId)) : null;

  // Check booking exists and get current status + isParentContract
  const [oldBooking] = await db
    .select({ status: bookingsTable.status, customerId: bookingsTable.customerId, isParentContract: bookingsTable.isParentContract })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, id));
  if (!oldBooking) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
  const oldStatus = oldBooking.status;

  // Task #55: enforce deductions = [] for parent contracts (checked from DB, not body)
  if (deductions !== undefined) {
    updateData.deductions = oldBooking.isParentContract ? [] : sanitizeDeductions(deductions);
  }

  // Run all changes in a single DB transaction: deposit payment upsert + booking update + recalculate
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Upsert/delete deposit payment record (only if depositAmount is in body) ──
    if (depositAmount !== undefined) {
      const newDepositAmount = parseFloat(String(depositAmount));

      const depResult = await client.query<{ id: number }>(
        `SELECT id FROM payments WHERE booking_id = $1 AND payment_type = 'deposit' ORDER BY id ASC`,
        [id]
      );
      const depRecords = depResult.rows;

      // Delete duplicates, keep oldest
      if (depRecords.length > 1) {
        for (const r of depRecords.slice(1)) {
          await client.query(`DELETE FROM payments WHERE id = $1`, [r.id]);
        }
      }

      if (newDepositAmount > 0) {
        if (depRecords.length > 0) {
          await client.query(`UPDATE payments SET amount = $1 WHERE id = $2`, [String(newDepositAmount), depRecords[0].id]);
        } else {
          await client.query(
            `INSERT INTO payments (booking_id, amount, payment_method, payment_type, paid_date, notes, paid_at)
             VALUES ($1, $2, 'cash', 'deposit', NOW(), 'Cọc giữ lịch', NOW())`,
            [id, String(newDepositAmount)]
          );
        }
      } else {
        if (depRecords.length > 0) {
          await client.query(`DELETE FROM payments WHERE id = $1`, [depRecords[0].id]);
        }
      }
    }

    // ── 2. Recalculate paid_amount from all payments ──
    const paidResult = await client.query<{ total_paid: string }>(
      `SELECT COALESCE(SUM(amount::numeric), 0) AS total_paid FROM payments WHERE booking_id = $1`,
      [id]
    );
    const paidAmount = parseFloat(paidResult.rows[0].total_paid);

    // ── 3. Calculate remaining_amount using effective totals ──
    const bkCurrentResult = await client.query<{ total_amount: string; discount_amount: string }>(
      `SELECT total_amount::numeric AS total_amount, COALESCE(discount_amount::numeric, 0) AS discount_amount FROM bookings WHERE id = $1`,
      [id]
    );
    const bkCurrent = bkCurrentResult.rows[0];
    const effectiveTotalAmount    = totalAmount    !== undefined ? parseFloat(String(totalAmount))    : parseFloat(bkCurrent.total_amount);
    const effectiveDiscountAmount = discountAmount !== undefined ? parseFloat(String(discountAmount)) : parseFloat(bkCurrent.discount_amount);
    const remainingAmount = Math.max(0, effectiveTotalAmount - effectiveDiscountAmount - paidAmount);

    updateData.paidAmount    = String(paidAmount);
    updateData.remainingAmount = String(remainingAmount);

    // ── 4. Build and execute booking UPDATE inside the same transaction ──
    const camelToSnake = (s: string) => s.replace(/([A-Z])/g, "_$1").toLowerCase();
    const jsonbColumns = new Set(["items", "surcharges", "assigned_staff", "required_roles", "deductions"]);
    const entries = Object.entries(updateData);
    const setClauses = entries.map(([k], i) => {
      const col = camelToSnake(k);
      return jsonbColumns.has(col) ? `${col} = $${i + 1}::jsonb` : `${col} = $${i + 1}`;
    }).join(", ");
    const params = [...entries.map(([k, v]) => {
      const col = camelToSnake(k);
      return jsonbColumns.has(col) ? JSON.stringify(v) : v;
    }), id];

    const updateResult = await client.query<{ customer_id: number }>(
      `UPDATE bookings SET ${setClauses} WHERE id = $${params.length} RETURNING customer_id`,
      params
    );
    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    await client.query("COMMIT");

    const customerId = updateResult.rows[0].customer_id;

    if (status === "completed" && oldStatus !== "completed") {
      computeBookingEarnings(id).catch(err => console.error("Earnings compute error:", err));
    }

    // Re-read full booking + customer (outside transaction is fine — data is committed)
    const [[fullBooking], [customer]] = await Promise.all([
      db.select().from(bookingsTable).where(eq(bookingsTable.id, id)),
      db.select({ name: customersTable.name, phone: customersTable.phone }).from(customersTable).where(eq(customersTable.id, customerId)),
    ]);

    res.json({
      ...fullBooking,
      customerName: customer?.name,
      customerPhone: customer?.phone,
      totalAmount:    parseFloat(fullBooking.totalAmount),
      depositAmount:  parseFloat(fullBooking.depositAmount),
      paidAmount,
      discountAmount: parseFloat(fullBooking.discountAmount ?? "0"),
      remainingAmount,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  } catch (err) {
    console.error("PUT /bookings/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống khi cập nhật đơn hàng" });
  }
});

router.delete("/bookings/:id", async (req, res) => {
  try {
  const id = parseInt(req.params.id);

  // Check if this is a parent contract — cascade delete children first
  const [target] = await db.select({ isParentContract: bookingsTable.isParentContract }).from(bookingsTable).where(eq(bookingsTable.id, id));
  if (target?.isParentContract) {
    // Delete all child bookings + their payments
    const children = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.parentId, id));
    if (children.length > 0) {
      const childIds = children.map(c => c.id);
      await db.delete(paymentsTable).where(inArray(paymentsTable.bookingId, childIds));
      await db.delete(bookingsTable).where(inArray(bookingsTable.id, childIds));
    }
  }

  // Delete the booking itself + its payments
  await db.delete(paymentsTable).where(eq(paymentsTable.bookingId, id));
  await db.delete(bookingsTable).where(eq(bookingsTable.id, id));
  res.status(204).send();
  } catch (err) {
    console.error("DELETE /bookings/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống khi xóa đơn hàng" });
  }
});

export default router;
