import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, customersTable, paymentsTable, expensesTable, tasksTable, staffTable } from "@workspace/db/schema";
import { eq, and, desc, inArray, or, ilike } from "drizzle-orm";
import { computeBookingEarnings } from "./job-earnings";

const router: IRouter = Router();

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
  createdAt: bookingsTable.createdAt,
};

router.get("/bookings", async (req, res) => {
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const parentId = req.query.parentId ? parseInt(req.query.parentId as string) : undefined;
  const q = (req.query.q as string | undefined)?.trim();

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

  const hasOtherFilters = !!(status || customerId || parentId);
  const rows = (!q && !hasOtherFilters)
    ? await baseQuery.limit(10)
    : await baseQuery;

  const allPayments = await db.select().from(paymentsTable);

  const bookings = rows.map((b) => {
    const bPayments = allPayments.filter(p => p.bookingId === b.id);
    const paidAmount = bPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalAmount = parseFloat(b.totalAmount);
    return {
      ...b,
      totalAmount,
      depositAmount: parseFloat(b.depositAmount),
      paidAmount,
      discountAmount: parseFloat(b.discountAmount ?? "0"),
      remainingAmount: Math.max(0, totalAmount - paidAmount),
    };
  });

  res.json(bookings);
});

router.post("/bookings", async (req, res) => {
  const {
    customerId, shootDate, shootTime, serviceCategory, packageType, location,
    totalAmount, depositAmount, discountAmount, items, surcharges, notes, internalNotes,
    assignedStaff, parentId, serviceLabel, isParentContract,
    // Deposit payment fields
    depositPaymentMethod, depositCollector,
    // Multi-service contract support
    subServices,
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
      remainingAmount: Math.max(0, parseFloat(parent.totalAmount) - parseFloat(parent.paidAmount)),
      children: children.map(c => ({ ...c, totalAmount: parseFloat(c.totalAmount) })),
    });
    return;
  }

  // ── Single booking (existing behavior) ──
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
      items: items || [],
      surcharges: surcharges || [],
      notes,
      internalNotes,
      assignedStaff: assignedStaff || [],
      parentId: parentId || null,
      serviceLabel: serviceLabel || null,
      isParentContract: isParentContract || false,
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
    remainingAmount: Math.max(0, parseFloat(booking.totalAmount) - parseFloat(booking.paidAmount)),
  });
});

router.get("/bookings/:id", async (req, res) => {
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
    })
    .from(tasksTable)
    .leftJoin(staffTable, eq(tasksTable.assigneeId, staffTable.id))
    .where(eq(tasksTable.bookingId, id));

  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalAmount = parseFloat(row.totalAmount);
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

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
      parentContract = {
        ...parentRow,
        totalAmount: parentTotal,
        depositAmount: parseFloat(parentRow.depositAmount),
        paidAmount: parentPaid,
        remainingAmount: Math.max(0, parentTotal - parentPaid),
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
    remainingAmount: Math.max(0, totalAmount - paidAmount),
    totalExpenses,
    grossProfit: totalAmount - totalExpenses,
    payments: payments.map(p => ({ ...p, amount: parseFloat(p.amount) })),
    expenses: expenses.map(e => ({ ...e, amount: parseFloat(e.amount) })),
    tasks,
    siblings,
    parentContract,
    children,
  });
});

router.put("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    shootDate, shootTime, serviceCategory, packageType, location, status,
    totalAmount, depositAmount, discountAmount, items, surcharges, notes, internalNotes,
    assignedStaff, parentId, serviceLabel, isParentContract, photoCount,
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

  if (Object.keys(updateData).length > 0) {
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
    const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    updateData.paidAmount = String(paidAmount);
  }

  const [oldBooking] = await db.select({ status: bookingsTable.status }).from(bookingsTable).where(eq(bookingsTable.id, id));
  const oldStatus = oldBooking?.status;

  const [booking] = await db.update(bookingsTable).set(updateData).where(eq(bookingsTable.id, id)).returning();
  if (!booking) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

  if (status === "completed" && oldStatus !== "completed") {
    computeBookingEarnings(id).catch(err => console.error("Earnings compute error:", err));
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, booking.customerId));
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);

  res.json({
    ...booking,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalAmount: parseFloat(booking.totalAmount),
    depositAmount: parseFloat(booking.depositAmount),
    paidAmount,
    discountAmount: parseFloat(booking.discountAmount ?? "0"),
    remainingAmount: Math.max(0, parseFloat(booking.totalAmount) - paidAmount),
  });
});

router.delete("/bookings/:id", async (req, res) => {
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
});

export default router;
