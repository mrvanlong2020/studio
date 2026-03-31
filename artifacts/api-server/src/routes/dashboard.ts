import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, customersTable, dressesTable, rentalsTable,
  paymentsTable, tasksTable, transactionsTable, expensesTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, count, sum, ne } from "drizzle-orm";

const router: IRouter = Router();

// ── Old stats route (backward compat) ─────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
type PeriodPreset = "today" | "7days" | "month" | "year";

interface BookingRow {
  id: number;
  orderCode: string | null;
  customerId: number;
  shootDate: string;
  status: string;
  serviceCategory: string;
  packageType: string;
  serviceLabel: string | null;
  totalAmount: string;
  discountAmount: string;
  paidAmount: string;
  createdAt: Date;
}

interface PaymentRow {
  id: number;
  bookingId: number | null;
  amount: string;
  paidAt: Date;
  paymentType: string;
}

interface ServiceEntry {
  category: string;
  serviceKey: string;
  label: string;
  bookedCount: number;
  bookedAmount: number;
  owedAmount: number;
  collectedAmount: number;
}

function getPeriodRange(preset: PeriodPreset): { start: Date; end: Date; startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start: Date;
  if (preset === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "7days") {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "year") {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  return {
    start,
    end,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function computeRemaining(b: { totalAmount: string; discountAmount: string; paidAmount: string }): number {
  return Math.max(
    0,
    parseFloat(b.totalAmount) - parseFloat(b.discountAmount || "0") - parseFloat(b.paidAmount),
  );
}

function buildDayBuckets(start: Date, end: Date): { date: string; amount: number; count: number }[] {
  const buckets: { date: string; amount: number; count: number }[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cur <= endDay) {
    buckets.push({ date: cur.toISOString().slice(0, 10), amount: 0, count: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return buckets;
}

function buildMonthBuckets(year: number): { date: string; amount: number; count: number }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    date: `${year}-${String(i + 1).padStart(2, "0")}`,
    amount: 0,
    count: 0,
  }));
}

const CATEGORY_LABELS: Record<string, string> = {
  wedding: "Cưới", prewedding: "Pre-wedding", portrait: "Chân dung",
  family: "Gia đình", fashion: "Thời trang", event: "Sự kiện",
  beauty: "Beauty", commercial: "Thương mại",
};

// ── Dashboard v2 ──────────────────────────────────────────────────────────────
// Response shape matches the user-approved JSON contract (nested: summary/charts/breakdown/debts).
router.get("/dashboard/v2", async (req, res) => {
  try {
    const preset = (req.query.period as PeriodPreset) || "month";
    const { start, end, startDate, endDate } = getPeriodRange(preset);
    const now = new Date();
    const year = now.getFullYear();
    const today = now.toISOString().slice(0, 10);

    // ── 1. Bookings in period (by createdAt) — for "đã chốt" KPI ──────────
    const bookingsInPeriod: BookingRow[] = await db
      .select({
        id: bookingsTable.id,
        orderCode: bookingsTable.orderCode,
        customerId: bookingsTable.customerId,
        shootDate: bookingsTable.shootDate,
        status: bookingsTable.status,
        serviceCategory: bookingsTable.serviceCategory,
        packageType: bookingsTable.packageType,
        serviceLabel: bookingsTable.serviceLabel,
        totalAmount: bookingsTable.totalAmount,
        discountAmount: bookingsTable.discountAmount,
        paidAmount: bookingsTable.paidAmount,
        createdAt: bookingsTable.createdAt,
      })
      .from(bookingsTable)
      .where(
        and(
          gte(bookingsTable.createdAt, start),
          lte(bookingsTable.createdAt, end),
          eq(bookingsTable.isParentContract, false),
          ne(bookingsTable.status, "cancelled"),
        ),
      );

    // ── 2. ALL active NON-PARENT bookings — for owed totals ───────────────
    const allActiveBookings: BookingRow[] = await db
      .select({
        id: bookingsTable.id,
        orderCode: bookingsTable.orderCode,
        customerId: bookingsTable.customerId,
        shootDate: bookingsTable.shootDate,
        status: bookingsTable.status,
        serviceCategory: bookingsTable.serviceCategory,
        packageType: bookingsTable.packageType,
        serviceLabel: bookingsTable.serviceLabel,
        totalAmount: bookingsTable.totalAmount,
        discountAmount: bookingsTable.discountAmount,
        paidAmount: bookingsTable.paidAmount,
        createdAt: bookingsTable.createdAt,
      })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.isParentContract, false),
          ne(bookingsTable.status, "cancelled"),
        ),
      );

    // ── 2b. ALL non-cancelled bookings (incl. parent contracts) — for service lookup
    // Payments may be recorded against parent contract bookings (isParentContract=true),
    // so we need to include them in the service lookup map.
    const allBookingsForLookup: BookingRow[] = await db
      .select({
        id: bookingsTable.id,
        orderCode: bookingsTable.orderCode,
        customerId: bookingsTable.customerId,
        shootDate: bookingsTable.shootDate,
        status: bookingsTable.status,
        serviceCategory: bookingsTable.serviceCategory,
        packageType: bookingsTable.packageType,
        serviceLabel: bookingsTable.serviceLabel,
        totalAmount: bookingsTable.totalAmount,
        discountAmount: bookingsTable.discountAmount,
        paidAmount: bookingsTable.paidAmount,
        createdAt: bookingsTable.createdAt,
      })
      .from(bookingsTable)
      .where(ne(bookingsTable.status, "cancelled"));

    // ── 3. All active bookings WITH customer info — for top debtors ────────
    const allActiveWithCustomer = await db
      .select({
        id: bookingsTable.id,
        orderCode: bookingsTable.orderCode,
        shootDate: bookingsTable.shootDate,
        status: bookingsTable.status,
        totalAmount: bookingsTable.totalAmount,
        discountAmount: bookingsTable.discountAmount,
        paidAmount: bookingsTable.paidAmount,
        customerName: customersTable.name,
        customerPhone: customersTable.phone,
      })
      .from(bookingsTable)
      .leftJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
      .where(
        and(
          eq(bookingsTable.isParentContract, false),
          ne(bookingsTable.status, "cancelled"),
        ),
      );

    // ── 4. Payments in period (by paidAt) — for "đã thu" KPI ─────────────
    const paymentsInPeriod: PaymentRow[] = await db
      .select({
        id: paymentsTable.id,
        bookingId: paymentsTable.bookingId,
        amount: paymentsTable.amount,
        paidAt: paymentsTable.paidAt,
        paymentType: paymentsTable.paymentType,
      })
      .from(paymentsTable)
      .where(
        and(
          gte(paymentsTable.paidAt, start),
          lte(paymentsTable.paidAt, end),
          ne(paymentsTable.paymentType, "refund"),
        ),
      );

    // ── 5. Expenses in period (by expenseDate) ─────────────────────────────
    const expensesInPeriod = await db
      .select({
        id: expensesTable.id,
        bookingId: expensesTable.bookingId,
        amount: expensesTable.amount,
        expenseDate: expensesTable.expenseDate,
      })
      .from(expensesTable)
      .where(
        and(
          gte(expensesTable.expenseDate, startDate),
          lte(expensesTable.expenseDate, endDate),
        ),
      );

    // ── 6. Upcoming bookings ───────────────────────────────────────────────
    const upcomingBookings = await db
      .select({
        id: bookingsTable.id,
        customerName: customersTable.name,
        customerPhone: customersTable.phone,
        shootDate: bookingsTable.shootDate,
        shootTime: bookingsTable.shootTime,
        packageType: bookingsTable.packageType,
        serviceLabel: bookingsTable.serviceLabel,
        status: bookingsTable.status,
      })
      .from(bookingsTable)
      .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
      .where(and(
        gte(bookingsTable.shootDate, today),
        ne(bookingsTable.status, "cancelled"),
        eq(bookingsTable.isParentContract, false),
      ))
      .orderBy(bookingsTable.shootDate)
      .limit(5);

    // ── Compute summary KPIs ───────────────────────────────────────────────
    const bookedAmount = bookingsInPeriod.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
    const bookedCount = bookingsInPeriod.length;

    const collectedAmount = paymentsInPeriod.reduce((s, p) => s + parseFloat(p.amount), 0);
    const collectedCount = paymentsInPeriod.length;

    // owedTotal / owedCount: use booking.remainingAmount = max(0, total-discount-paid)
    const owedTotal = allActiveBookings.reduce((s, b) => s + computeRemaining(b), 0);
    const owedCount = allActiveBookings.filter(b => computeRemaining(b) > 0).length;
    const owedInPeriod = bookingsInPeriod.reduce((s, b) => s + computeRemaining(b), 0);

    const linkedExpenses = expensesInPeriod
      .filter(e => e.bookingId != null)
      .reduce((s, e) => s + parseFloat(e.amount), 0);
    const generalExpenses = expensesInPeriod
      .filter(e => e.bookingId == null)
      .reduce((s, e) => s + parseFloat(e.amount), 0);
    const totalExpenses = linkedExpenses + generalExpenses;
    const profit = collectedAmount - totalExpenses;

    // ── Charts ─────────────────────────────────────────────────────────────
    let chartBooked: { date: string; amount: number; count: number }[];
    let chartCollected: { date: string; amount: number; count: number }[];

    if (preset === "year") {
      const bookedBuckets = buildMonthBuckets(year);
      const collectedBuckets = buildMonthBuckets(year);

      // chartBooked: from bookings.createdAt
      bookingsInPeriod.forEach(b => {
        const m = new Date(b.createdAt).getMonth();
        bookedBuckets[m].amount += parseFloat(b.totalAmount);
        bookedBuckets[m].count += 1;
      });
      // chartCollected: from payments.paidAt
      paymentsInPeriod.forEach(p => {
        const m = new Date(p.paidAt).getMonth();
        collectedBuckets[m].amount += parseFloat(p.amount);
        collectedBuckets[m].count += 1;
      });

      chartBooked = bookedBuckets;
      chartCollected = collectedBuckets;
    } else {
      const bookedBuckets = buildDayBuckets(start, end);
      const collectedBuckets = buildDayBuckets(start, end);

      bookingsInPeriod.forEach(b => {
        const d = new Date(b.createdAt).toISOString().slice(0, 10);
        const bk = bookedBuckets.find(bk => bk.date === d);
        if (bk) { bk.amount += parseFloat(b.totalAmount); bk.count += 1; }
      });

      paymentsInPeriod.forEach(p => {
        const d = new Date(p.paidAt).toISOString().slice(0, 10);
        const bk = collectedBuckets.find(bk => bk.date === d);
        if (bk) { bk.amount += parseFloat(p.amount); bk.count += 1; }
      });

      chartBooked = bookedBuckets;
      chartCollected = collectedBuckets;
    }

    // ── Build service attribution maps from ALL non-cancelled bookings ────
    // Includes parent contracts so payments made against parent booking IDs
    // are still attributed to the correct service/category.
    const bookingServiceLookup = new Map<number, { serviceKey: string; category: string; label: string }>();
    for (const b of allBookingsForLookup) {
      bookingServiceLookup.set(b.id, {
        serviceKey: b.packageType || b.serviceCategory || "other",
        category: b.serviceCategory || "other",
        label: b.serviceLabel || b.packageType || b.serviceCategory || "Khác",
      });
    }

    const bookingCategoryLookup = new Map<number, { category: string; label: string }>();
    for (const b of allBookingsForLookup) {
      const cat = b.serviceCategory || "other";
      bookingCategoryLookup.set(b.id, { category: cat, label: CATEGORY_LABELS[cat] || cat });
    }

    // ── byService breakdown ────────────────────────────────────────────────
    const serviceMap = new Map<string, ServiceEntry>();

    // 1. Populate booked/owed from bookingsInPeriod
    for (const b of bookingsInPeriod) {
      const key = b.packageType || b.serviceCategory || "other";
      const label = b.serviceLabel || b.packageType || b.serviceCategory || "Khác";
      const cat = b.serviceCategory || "other";
      const rem = computeRemaining(b);

      if (!serviceMap.has(key)) {
        serviceMap.set(key, { category: cat, serviceKey: key, label, bookedCount: 0, bookedAmount: 0, owedAmount: 0, collectedAmount: 0 });
      }
      const e = serviceMap.get(key)!;
      e.bookedCount += 1;
      e.bookedAmount += parseFloat(b.totalAmount);
      e.owedAmount += rem;
    }

    // 2. Attribute payments to services using ALL active bookings as lookup
    for (const p of paymentsInPeriod) {
      if (p.bookingId == null) continue;
      const svc = bookingServiceLookup.get(p.bookingId);
      if (!svc) continue;

      // Ensure an entry exists even if the booking wasn't created in this period
      if (!serviceMap.has(svc.serviceKey)) {
        serviceMap.set(svc.serviceKey, {
          category: svc.category, serviceKey: svc.serviceKey, label: svc.label,
          bookedCount: 0, bookedAmount: 0, owedAmount: 0, collectedAmount: 0,
        });
      }
      serviceMap.get(svc.serviceKey)!.collectedAmount += parseFloat(p.amount);
    }

    const totalBookedSvc = Array.from(serviceMap.values()).reduce((s, v) => s + v.bookedAmount, 0) || 1;
    const totalCollectedSvc = Array.from(serviceMap.values()).reduce((s, v) => s + v.collectedAmount, 0) || 1;

    const byService = Array.from(serviceMap.values())
      .map(v => ({
        ...v,
        bookedPercent: parseFloat(((v.bookedAmount / totalBookedSvc) * 100).toFixed(1)),
        collectedPercent: parseFloat(((v.collectedAmount / totalCollectedSvc) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.bookedAmount - a.bookedAmount);

    // ── byCategory breakdown ───────────────────────────────────────────────
    const categoryMap = new Map<string, ServiceEntry>();

    for (const b of bookingsInPeriod) {
      const cat = b.serviceCategory || "other";
      const label = CATEGORY_LABELS[cat] || cat;
      const rem = computeRemaining(b);

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { category: cat, serviceKey: cat, label, bookedCount: 0, bookedAmount: 0, owedAmount: 0, collectedAmount: 0 });
      }
      const e = categoryMap.get(cat)!;
      e.bookedCount += 1;
      e.bookedAmount += parseFloat(b.totalAmount);
      e.owedAmount += rem;
    }

    for (const p of paymentsInPeriod) {
      if (p.bookingId == null) continue;
      const catInfo = bookingCategoryLookup.get(p.bookingId);
      if (!catInfo) continue;

      if (!categoryMap.has(catInfo.category)) {
        categoryMap.set(catInfo.category, {
          category: catInfo.category, serviceKey: catInfo.category, label: catInfo.label,
          bookedCount: 0, bookedAmount: 0, owedAmount: 0, collectedAmount: 0,
        });
      }
      categoryMap.get(catInfo.category)!.collectedAmount += parseFloat(p.amount);
    }

    const totalBookedCat = Array.from(categoryMap.values()).reduce((s, v) => s + v.bookedAmount, 0) || 1;
    const totalCollectedCat = Array.from(categoryMap.values()).reduce((s, v) => s + v.collectedAmount, 0) || 1;

    const byCategory = Array.from(categoryMap.values())
      .map(v => ({
        ...v,
        bookedPercent: parseFloat(((v.bookedAmount / totalBookedCat) * 100).toFixed(1)),
        collectedPercent: parseFloat(((v.collectedAmount / totalCollectedCat) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.bookedAmount - a.bookedAmount);

    // ── Top debtors (all time, sorted by remainingAmount desc) ────────────
    const topDebtors = allActiveWithCustomer
      .map(b => ({
        bookingId: b.id,
        bookingCode: b.orderCode || `DH${String(b.id).padStart(4, "0")}`,
        customerName: b.customerName || "—",
        customerPhone: b.customerPhone || "",
        totalAmount: parseFloat(b.totalAmount),
        paidAmount: parseFloat(b.paidAmount),
        remainingAmount: computeRemaining(b),
        shootDate: b.shootDate,
        status: b.status,
      }))
      .filter(b => b.remainingAmount > 0)
      .sort((a, b) => b.remainingAmount - a.remainingAmount)
      .slice(0, 10);

    // ── Response (nested shape per user-approved contract) ─────────────────
    res.json({
      period: {
        preset,
        from: startDate,
        to: endDate,
        bookingDateMode: "createdAt",
      },
      summary: {
        bookedAmount,
        bookedCount,
        collectedAmount,
        collectedCount,
        owedTotal,
        owedCount,
        owedInPeriod,
        profit,
        linkedExpenses,
        generalExpenses,
        totalExpenses,
      },
      charts: {
        booked: chartBooked,
        collected: chartCollected,
      },
      breakdown: {
        byService,
        byCategory,
      },
      debts: {
        topDebtors,
      },
      upcomingBookings,
      meta: {
        currency: "VND",
        bookingDateModeOptions: ["createdAt", "shootDate"],
        notes: [
          "bookedAmount lấy từ bookings.createdAt",
          "collectedAmount lấy từ payments.paidAt",
          "profit = collectedAmount - totalExpenses trong cùng kỳ",
          "owedTotal dùng remainingAmount = max(0, total - discount - paid)",
          "byService/byCategory.collectedAmount: gán payment theo booking từ toàn bộ active bookings",
        ],
      },
    });
  } catch (err) {
    console.error("[dashboard/v2]", err);
    res.status(500).json({ error: "Lỗi tải dashboard v2" });
  }
});

export default router;
