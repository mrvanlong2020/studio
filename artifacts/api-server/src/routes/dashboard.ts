import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, customersTable, dressesTable, rentalsTable, paymentsTable, tasksTable, transactionsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, count, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [totalCustomers] = await db.select({ count: count() }).from(customersTable);
  const [totalBookings] = await db.select({ count: count() }).from(bookingsTable);
  const [bookingsThisMonth] = await db.select({ count: count() }).from(bookingsTable)
    .where(and(gte(bookingsTable.shootDate, startOfMonth), lte(bookingsTable.shootDate, endOfMonth)));
  const [pendingBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending"));
  const [confirmedBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "confirmed"));
  const [completedBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "completed"));

  const [totalDresses] = await db.select({ count: count() }).from(dressesTable);
  const [availableDresses] = await db.select({ count: count() }).from(dressesTable).where(eq(dressesTable.isAvailable, true));
  const [activeRentals] = await db.select({ count: count() }).from(rentalsTable).where(eq(rentalsTable.status, "rented"));
  const [overdueRentals] = await db.select({ count: count() }).from(rentalsTable).where(eq(rentalsTable.status, "overdue"));
  const [pendingTasks] = await db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "todo"));

  const monthTransactions = await db.select().from(transactionsTable)
    .where(and(gte(transactionsTable.transactionDate, startOfMonth), lte(transactionsTable.transactionDate, endOfMonth)));
  const totalIncomeThisMonth = monthTransactions.filter(t => t.type === "income").reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalExpenseThisMonth = monthTransactions.filter(t => t.type === "expense").reduce((s, t) => s + parseFloat(t.amount), 0);
  const profitThisMonth = totalIncomeThisMonth - totalExpenseThisMonth;

  const [allPaymentsSum] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable);
  const totalRevenue = parseFloat(allPaymentsSum.total ?? "0");

  const allPayments = await db.select().from(paymentsTable)
    .where(and(gte(paymentsTable.paidAt, new Date(startOfMonth)), lte(paymentsTable.paidAt, new Date(endOfMonth + "T23:59:59"))));
  const revenueThisMonth = allPayments.reduce((s, p) => s + parseFloat(p.amount), 0);

  // Công nợ
  const allBookings = await db.select().from(bookingsTable);
  const allPaymentsAll = await db.select().from(paymentsTable);
  const totalOwed = allBookings.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
  const totalPaidAll = allPaymentsAll.filter(p => p.paymentType !== "refund").reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalDebt = Math.max(0, totalOwed - totalPaidAll);

  const upcomingRows = await db
    .select({
      id: bookingsTable.id,
      customerId: bookingsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      shootDate: bookingsTable.shootDate,
      shootTime: bookingsTable.shootTime,
      packageType: bookingsTable.packageType,
      status: bookingsTable.status,
      totalAmount: bookingsTable.totalAmount,
      depositAmount: bookingsTable.depositAmount,
      notes: bookingsTable.notes,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(and(gte(bookingsTable.shootDate, today), eq(bookingsTable.status, "confirmed")))
    .orderBy(bookingsTable.shootDate)
    .limit(5);

  const upcomingBookings = upcomingRows.map((b) => ({
    ...b,
    totalAmount: parseFloat(b.totalAmount),
    depositAmount: parseFloat(b.depositAmount),
    remainingAmount: parseFloat(b.totalAmount) - parseFloat(b.depositAmount),
    assignedStaffId: null,
    assignedStaffName: null,
  }));

  res.json({
    totalCustomers: totalCustomers.count,
    totalBookings: totalBookings.count,
    bookingsThisMonth: bookingsThisMonth.count,
    pendingBookings: pendingBookings.count,
    confirmedBookings: confirmedBookings.count,
    completedBookings: completedBookings.count,
    totalDresses: totalDresses.count,
    availableDresses: availableDresses.count,
    activeRentals: activeRentals.count,
    overdueRentals: overdueRentals.count,
    revenueThisMonth,
    totalRevenue,
    profitThisMonth,
    totalExpenseThisMonth,
    totalIncomeThisMonth,
    upcomingBookings,
    pendingTasks: pendingTasks.count,
    totalDebt,
  });
});

export default router;
