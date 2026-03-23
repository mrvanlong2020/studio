import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, customersTable, dressesTable, rentalsTable, paymentsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, count, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [totalCustomers] = await db.select({ count: count() }).from(customersTable);
  const [totalBookings] = await db.select({ count: count() }).from(bookingsTable);
  const [bookingsThisMonth] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(and(gte(bookingsTable.shootDate, startOfMonth), lte(bookingsTable.shootDate, endOfMonth)));

  const [pendingBookings] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "pending"));
  const [confirmedBookings] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "confirmed"));
  const [completedBookings] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "completed"));

  const [totalDresses] = await db.select({ count: count() }).from(dressesTable);
  const [availableDresses] = await db
    .select({ count: count() })
    .from(dressesTable)
    .where(eq(dressesTable.isAvailable, true));
  const [activeRentals] = await db
    .select({ count: count() })
    .from(rentalsTable)
    .where(eq(rentalsTable.status, "rented"));
  const [overdueRentals] = await db
    .select({ count: count() })
    .from(rentalsTable)
    .where(eq(rentalsTable.status, "overdue"));

  const today = now.toISOString().slice(0, 10);
  const [revenueThisMonthRow] = await db
    .select({ total: sum(paymentsTable.amount) })
    .from(paymentsTable)
    .where(and(gte(paymentsTable.paidAt, new Date(startOfMonth)), lte(paymentsTable.paidAt, new Date(endOfMonth + "T23:59:59"))));

  const [totalRevenueRow] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable);

  const upcomingBookingsRows = await db
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
    .where(
      and(
        gte(bookingsTable.shootDate, today),
        eq(bookingsTable.status, "confirmed")
      )
    )
    .orderBy(bookingsTable.shootDate)
    .limit(5);

  const upcomingBookings = upcomingBookingsRows.map((b) => ({
    ...b,
    totalAmount: parseFloat(b.totalAmount),
    depositAmount: parseFloat(b.depositAmount),
    remainingAmount: parseFloat(b.totalAmount) - parseFloat(b.depositAmount),
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
    revenueThisMonth: parseFloat(revenueThisMonthRow.total ?? "0"),
    totalRevenue: parseFloat(totalRevenueRow.total ?? "0"),
    upcomingBookings,
  });
});

export default router;
