import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, expensesTable, staffTable } from "@workspace/db/schema";

const router: IRouter = Router();

function parseStatuses(statusFilter?: string): string[] {
  if (!statusFilter || statusFilter === "all") return ["pending", "confirmed", "completed"];
  if (statusFilter === "confirmed") return ["confirmed", "completed"];
  if (statusFilter === "completed") return ["completed"];
  return statusFilter.split(",").filter(Boolean);
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

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
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

router.get("/revenue/stats", async (req, res) => {
  const statuses = parseStatuses(req.query.statusFilter as string | undefined);
  const now = new Date();
  const today = getToday();
  const weekStart = getWeekStart(now);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;
  const yearEnd = `${now.getFullYear()}-12-31`;

  const allBookings = await db.select({
    id: bookingsTable.id,
    totalAmount: bookingsTable.totalAmount,
    shootDate: bookingsTable.shootDate,
    status: bookingsTable.status,
    isParentContract: bookingsTable.isParentContract,
  }).from(bookingsTable);

  const allExpenses = await db.select({
    amount: expensesTable.amount,
    expenseDate: expensesTable.expenseDate,
  }).from(expensesTable);

  const valid = allBookings.filter(
    b => statuses.includes(b.status) && b.status !== "cancelled" && !b.isParentContract
  );

  function revenueIn(start: string, end: string) {
    return valid.filter(b => b.shootDate >= start && b.shootDate <= end)
      .reduce((s, b) => s + parseFloat(b.totalAmount), 0);
  }
  function expensesIn(start: string, end: string) {
    return allExpenses.filter(e => e.expenseDate >= start && e.expenseDate <= end)
      .reduce((s, e) => s + parseFloat(e.amount), 0);
  }
  function countIn(start: string, end: string) {
    return valid.filter(b => b.shootDate >= start && b.shootDate <= end).length;
  }

  const periods = [
    { key: "today", start: today, end: today },
    { key: "week", start: weekStart, end: today },
    { key: "month", start: monthStart, end: today },
    { key: "year", start: yearStart, end: yearEnd },
  ];

  const result: Record<string, number> = {};
  for (const p of periods) {
    const rev = revenueIn(p.start, p.end);
    const exp = expensesIn(p.start, p.end);
    result[`${p.key}Revenue`] = rev;
    result[`${p.key}Expenses`] = exp;
    result[`${p.key}Profit`] = rev - exp;
    result[`${p.key}Count`] = countIn(p.start, p.end);
  }

  res.json(result);
});

router.get("/revenue/by-period", async (req, res) => {
  const statuses = parseStatuses(req.query.statusFilter as string | undefined);
  const mode = (req.query.mode as string) || "7days";

  const now = new Date();
  const today = getToday();

  const allBookings = await db.select({
    totalAmount: bookingsTable.totalAmount,
    shootDate: bookingsTable.shootDate,
    status: bookingsTable.status,
    isParentContract: bookingsTable.isParentContract,
  }).from(bookingsTable);

  const allExpenses = await db.select({
    amount: expensesTable.amount,
    expenseDate: expensesTable.expenseDate,
  }).from(expensesTable);

  const valid = allBookings.filter(
    b => statuses.includes(b.status) && b.status !== "cancelled" && !b.isParentContract
  );

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
    // 12months
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
    const rev = valid.filter(b => b.shootDate >= p.start && b.shootDate <= p.end)
      .reduce((s, b) => s + parseFloat(b.totalAmount), 0);
    const exp = allExpenses.filter(e => e.expenseDate >= p.start && e.expenseDate <= p.end)
      .reduce((s, e) => s + parseFloat(e.amount), 0);
    p.revenue = rev;
    p.expenses = exp;
    p.profit = rev - exp;
  }

  res.json(points.map(p => ({
    label: p.label,
    revenue: p.revenue,
    expenses: p.expenses,
    profit: p.profit,
  })));
});

router.get("/revenue/by-service", async (req, res) => {
  const statuses = parseStatuses(req.query.statusFilter as string | undefined);

  const allBookings = await db.select({
    totalAmount: bookingsTable.totalAmount,
    serviceCategory: bookingsTable.serviceCategory,
    status: bookingsTable.status,
    isParentContract: bookingsTable.isParentContract,
  }).from(bookingsTable);

  const allExpenses = await db.select({
    amount: expensesTable.amount,
    expenseDate: expensesTable.expenseDate,
  }).from(expensesTable);

  const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  const valid = allBookings.filter(
    b => statuses.includes(b.status) && b.status !== "cancelled" && !b.isParentContract
  );

  const map = new Map<string, { count: number; revenue: number }>();
  for (const b of valid) {
    const cat = b.serviceCategory || "other";
    const existing = map.get(cat) ?? { count: 0, revenue: 0 };
    map.set(cat, { count: existing.count + 1, revenue: existing.revenue + parseFloat(b.totalAmount) });
  }

  const totalRevenue = valid.reduce((s, b) => s + parseFloat(b.totalAmount), 0);

  const rows = Array.from(map.entries())
    .map(([cat, data]) => ({
      service: SERVICE_LABELS[cat] ?? cat,
      serviceKey: cat,
      count: data.count,
      revenue: data.revenue,
      profit: data.revenue - (totalRevenue > 0 ? totalExpenses * (data.revenue / totalRevenue) : 0),
      percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  res.json(rows);
});

router.get("/revenue/by-sale", async (req, res) => {
  const statuses = parseStatuses(req.query.statusFilter as string | undefined);

  const allBookings = await db.select({
    totalAmount: bookingsTable.totalAmount,
    status: bookingsTable.status,
    isParentContract: bookingsTable.isParentContract,
    assignedStaff: bookingsTable.assignedStaff,
  }).from(bookingsTable);

  const allExpenses = await db.select({
    amount: expensesTable.amount,
  }).from(expensesTable);

  const allStaff = await db.select({
    id: staffTable.id,
    name: staffTable.name,
  }).from(staffTable);

  const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  const valid = allBookings.filter(
    b => statuses.includes(b.status) && b.status !== "cancelled" && !b.isParentContract
  );

  const totalRevenue = valid.reduce((s, b) => s + parseFloat(b.totalAmount), 0);

  const map = new Map<number, { count: number; revenue: number }>();
  let unassignedCount = 0;
  let unassignedRevenue = 0;

  for (const b of valid) {
    const staff = b.assignedStaff as Record<string, unknown> | null;
    const saleId = staff && typeof staff === "object" && !Array.isArray(staff)
      ? (staff["sale"] as number | undefined)
      : undefined;

    if (saleId && typeof saleId === "number") {
      const existing = map.get(saleId) ?? { count: 0, revenue: 0 };
      map.set(saleId, { count: existing.count + 1, revenue: existing.revenue + parseFloat(b.totalAmount) });
    } else {
      unassignedCount++;
      unassignedRevenue += parseFloat(b.totalAmount);
    }
  }

  const staffMap = new Map(allStaff.map(s => [s.id, s.name]));

  const rows = Array.from(map.entries())
    .map(([saleId, data]) => ({
      staffId: saleId,
      staffName: staffMap.get(saleId) ?? `Nhân viên #${saleId}`,
      count: data.count,
      revenue: data.revenue,
      profit: data.revenue - (totalRevenue > 0 ? totalExpenses * (data.revenue / totalRevenue) : 0),
      contribution: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  if (unassignedRevenue > 0) {
    rows.push({
      staffId: 0,
      staffName: "Chưa gán Sale",
      count: unassignedCount,
      revenue: unassignedRevenue,
      profit: unassignedRevenue - (totalRevenue > 0 ? totalExpenses * (unassignedRevenue / totalRevenue) : 0),
      contribution: totalRevenue > 0 ? Math.round((unassignedRevenue / totalRevenue) * 100) : 0,
    });
  }

  res.json(rows);
});

export default router;
