import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, expensesTable, staffTable } from "@workspace/db/schema";

const router: IRouter = Router();

function parseFilter(q: Record<string, unknown>): { statuses: string[]; onlyPaid: boolean } {
  const onlyConfirmed = q["onlyConfirmed"] === "true";
  const onlyPaid = q["onlyPaid"] === "true";

  let statuses: string[];
  if (onlyPaid) {
    statuses = ["confirmed", "completed"];
  } else if (onlyConfirmed) {
    statuses = ["confirmed", "completed"];
  } else {
    statuses = ["pending", "confirmed", "completed"];
  }
  return { statuses, onlyPaid };
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart(now: Date): string {
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

const SERVICE_LABELS: Record<string, string> = {
  wedding: "Cưới / Ngày cưới",
  prewedding: "Chụp Pre-wedding",
  maternity: "Chụp Bầu",
  baby: "Chụp Em bé",
  birthday: "Sinh nhật",
  family: "Gia đình",
  portrait: "Chân dung",
  event: "Sự kiện",
  other: "Khác",
};

// Fetch all bookings + their linked expenses in one pass
async function getBookingData() {
  const bookings = await db.select({
    id: bookingsTable.id,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    shootDate: bookingsTable.shootDate,
    status: bookingsTable.status,
    isParentContract: bookingsTable.isParentContract,
    serviceCategory: bookingsTable.serviceCategory,
    assignedStaff: bookingsTable.assignedStaff,
  }).from(bookingsTable);

  const expenses = await db.select({
    bookingId: expensesTable.bookingId,
    amount: expensesTable.amount,
  }).from(expensesTable);

  // Build a map of bookingId -> linked expense total
  const expenseByBooking = new Map<number, number>();
  for (const e of expenses) {
    if (e.bookingId != null) {
      expenseByBooking.set(e.bookingId, (expenseByBooking.get(e.bookingId) ?? 0) + parseFloat(e.amount));
    }
  }

  return { bookings, expenseByBooking };
}

function filterBookings(
  bookings: Awaited<ReturnType<typeof getBookingData>>["bookings"],
  statuses: string[],
  onlyPaid: boolean,
) {
  return bookings.filter(b => {
    if (b.isParentContract) return false;
    if (b.status === "cancelled") return false;
    if (!statuses.includes(b.status)) return false;
    if (onlyPaid) {
      const total = parseFloat(b.totalAmount);
      const paid = parseFloat(b.paidAmount ?? "0");
      if (total <= 0 || paid < total) return false;
    }
    return true;
  });
}

router.get("/revenue/stats", async (req, res) => {
  const { statuses, onlyPaid } = parseFilter(req.query as Record<string, unknown>);
  const { bookings, expenseByBooking } = await getBookingData();
  const valid = filterBookings(bookings, statuses, onlyPaid);

  const now = new Date();
  const today = getToday();
  const weekStart = getWeekStart(now);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  function sumInPeriod(start: string, end: string) {
    const inPeriod = valid.filter(b => b.shootDate >= start && b.shootDate <= end);
    const revenue = inPeriod.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
    const expenses = inPeriod.reduce((s, b) => s + (expenseByBooking.get(b.id) ?? 0), 0);
    return { revenue, expenses, profit: revenue - expenses, count: inPeriod.length };
  }

  const todayData = sumInPeriod(today, today);
  const weekData = sumInPeriod(weekStart, today);
  const monthData = sumInPeriod(monthStart, today);
  const yearData = sumInPeriod(yearStart, today);

  res.json({
    todayRevenue: todayData.revenue,
    todayExpenses: todayData.expenses,
    todayProfit: todayData.profit,
    todayCount: todayData.count,
    weekRevenue: weekData.revenue,
    weekExpenses: weekData.expenses,
    weekProfit: weekData.profit,
    weekCount: weekData.count,
    monthRevenue: monthData.revenue,
    monthExpenses: monthData.expenses,
    monthProfit: monthData.profit,
    monthCount: monthData.count,
    yearRevenue: yearData.revenue,
    yearExpenses: yearData.expenses,
    yearProfit: yearData.profit,
    yearCount: yearData.count,
  });
});

router.get("/revenue/by-period", async (req, res) => {
  const { statuses, onlyPaid } = parseFilter(req.query as Record<string, unknown>);
  const mode = (req.query["mode"] as string) || "7days";
  const { bookings, expenseByBooking } = await getBookingData();
  const valid = filterBookings(bookings, statuses, onlyPaid);

  const now = new Date();

  type PeriodPoint = { label: string; revenue: number; expenses: number; profit: number; start: string; end: string };
  const points: PeriodPoint[] = [];

  if (mode === "7days") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const label = i === 0 ? "Hôm nay" : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
      points.push({ label, start: ds, end: ds, revenue: 0, expenses: 0, profit: 0 });
    }
  } else if (mode === "4weeks") {
    for (let i = 3; i >= 0; i--) {
      const wEnd = new Date(now); wEnd.setDate(wEnd.getDate() - i * 7);
      const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6);
      const startStr = wStart.toISOString().slice(0, 10);
      const endStr = wEnd.toISOString().slice(0, 10);
      const label = `${wStart.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} - ${wEnd.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`;
      points.push({ label, start: startStr, end: endStr, revenue: 0, expenses: 0, profit: 0 });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const endStr = `${ym}-${String(lastDay).padStart(2, "0")}`;
      const label = d.toLocaleDateString("vi-VN", { month: "short", year: "2-digit" });
      points.push({ label, start: `${ym}-01`, end: endStr, revenue: 0, expenses: 0, profit: 0 });
    }
  }

  for (const p of points) {
    const inPeriod = valid.filter(b => b.shootDate >= p.start && b.shootDate <= p.end);
    p.revenue = inPeriod.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
    p.expenses = inPeriod.reduce((s, b) => s + (expenseByBooking.get(b.id) ?? 0), 0);
    p.profit = p.revenue - p.expenses;
  }

  res.json(points.map(p => ({ label: p.label, revenue: p.revenue, expenses: p.expenses, profit: p.profit })));
});

router.get("/revenue/by-service", async (req, res) => {
  const { statuses, onlyPaid } = parseFilter(req.query as Record<string, unknown>);
  const { bookings, expenseByBooking } = await getBookingData();
  const valid = filterBookings(bookings, statuses, onlyPaid);

  const map = new Map<string, { count: number; revenue: number; expenses: number }>();
  for (const b of valid) {
    const cat = b.serviceCategory || "other";
    const existing = map.get(cat) ?? { count: 0, revenue: 0, expenses: 0 };
    map.set(cat, {
      count: existing.count + 1,
      revenue: existing.revenue + parseFloat(b.totalAmount),
      expenses: existing.expenses + (expenseByBooking.get(b.id) ?? 0),
    });
  }

  const totalRevenue = valid.reduce((s, b) => s + parseFloat(b.totalAmount), 0);

  const rows = Array.from(map.entries())
    .map(([cat, data]) => ({
      service: SERVICE_LABELS[cat] ?? cat,
      serviceKey: cat,
      count: data.count,
      revenue: data.revenue,
      profit: data.revenue - data.expenses,
      percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  res.json(rows);
});

router.get("/revenue/by-sale", async (req, res) => {
  const { statuses, onlyPaid } = parseFilter(req.query as Record<string, unknown>);
  const { bookings, expenseByBooking } = await getBookingData();
  const valid = filterBookings(bookings, statuses, onlyPaid);

  const allStaff = await db.select({ id: staffTable.id, name: staffTable.name }).from(staffTable);
  const staffMap = new Map(allStaff.map(s => [s.id, s.name]));

  const map = new Map<number, { count: number; revenue: number; expenses: number }>();
  let unassignedCount = 0;
  let unassignedRevenue = 0;
  let unassignedExpenses = 0;

  for (const b of valid) {
    const staff = b.assignedStaff as Record<string, unknown> | null;
    const saleId = staff && typeof staff === "object" && !Array.isArray(staff)
      ? (staff["sale"] as number | undefined)
      : undefined;

    const exp = expenseByBooking.get(b.id) ?? 0;
    const rev = parseFloat(b.totalAmount);

    if (saleId && typeof saleId === "number") {
      const existing = map.get(saleId) ?? { count: 0, revenue: 0, expenses: 0 };
      map.set(saleId, { count: existing.count + 1, revenue: existing.revenue + rev, expenses: existing.expenses + exp });
    } else {
      unassignedCount++;
      unassignedRevenue += rev;
      unassignedExpenses += exp;
    }
  }

  const totalRevenue = valid.reduce((s, b) => s + parseFloat(b.totalAmount), 0);

  const rows = Array.from(map.entries())
    .map(([saleId, data]) => ({
      staffId: saleId,
      staffName: staffMap.get(saleId) ?? `Nhân viên #${saleId}`,
      count: data.count,
      revenue: data.revenue,
      profit: data.revenue - data.expenses,
      contribution: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  if (unassignedRevenue > 0) {
    rows.push({
      staffId: 0,
      staffName: "Chưa gán Sale",
      count: unassignedCount,
      revenue: unassignedRevenue,
      profit: unassignedRevenue - unassignedExpenses,
      contribution: totalRevenue > 0 ? Math.round((unassignedRevenue / totalRevenue) * 100) : 0,
    });
  }

  res.json(rows);
});

export default router;
