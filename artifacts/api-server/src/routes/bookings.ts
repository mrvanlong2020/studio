import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, customersTable, paymentsTable, expensesTable, tasksTable, staffTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { computeBookingEarnings } from "./job-earnings";

const router: IRouter = Router();

const fmt = async (b: typeof bookingsTable.$inferSelect & { customerName: string; customerPhone: string }) => {
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, b.id));
  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalAmount = parseFloat(b.totalAmount);
  const depositAmount = parseFloat(b.depositAmount);
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.bookingId, b.id));
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
  return {
    ...b,
    totalAmount,
    depositAmount,
    paidAmount,
    discountAmount: parseFloat(b.discountAmount ?? "0"),
    remainingAmount: Math.max(0, totalAmount - paidAmount),
    totalExpenses,
    grossProfit: totalAmount - totalExpenses,
    payments: payments.map(p => ({ ...p, amount: parseFloat(p.amount) })),
  };
};

router.get("/bookings", async (req, res) => {
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;

  const rows = await db
    .select({
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
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(
      and(
        status ? eq(bookingsTable.status, status) : undefined,
        customerId ? eq(bookingsTable.customerId, customerId) : undefined
      )
    )
    .orderBy(desc(bookingsTable.shootDate));

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
  const { customerId, shootDate, shootTime, serviceCategory, packageType, location, totalAmount, depositAmount, discountAmount, items, surcharges, notes, internalNotes, assignedStaff } = req.body;
  const count = await db.select().from(bookingsTable);
  const orderCode = `DH${String(count.length + 1).padStart(4, "0")}`;
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
      status: "pending",
    })
    .returning();

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));

  if (depositAmount && parseFloat(String(depositAmount)) > 0) {
    await db.insert(paymentsTable).values({
      bookingId: booking.id,
      amount: String(depositAmount),
      paymentMethod: "cash",
      paymentType: "deposit",
      notes: "Tiền cọc ban đầu",
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
    .select({
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
      createdAt: bookingsTable.createdAt,
    })
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
  });
});

router.put("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { shootDate, shootTime, serviceCategory, packageType, location, status, totalAmount, depositAmount, discountAmount, items, surcharges, notes, internalNotes, assignedStaff } = req.body;

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

  if (Object.keys(updateData).length > 0) {
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
    const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    updateData.paidAmount = String(paidAmount);
  }

  // Get old status before update
  const [oldBooking] = await db.select({ status: bookingsTable.status }).from(bookingsTable).where(eq(bookingsTable.id, id));
  const oldStatus = oldBooking?.status;

  const [booking] = await db.update(bookingsTable).set(updateData).where(eq(bookingsTable.id, id)).returning();
  if (!booking) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

  // Auto-compute job earnings when job is marked as completed
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
  await db.delete(bookingsTable).where(eq(bookingsTable.id, id));
  res.status(204).send();
});

export default router;
