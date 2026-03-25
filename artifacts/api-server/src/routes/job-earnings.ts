import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  staffJobEarningsTable, staffRatePricesTable,
  staffTable, bookingsTable, serviceJobSplitsTable, servicesTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

const fmtEarning = (e: { rate: string; [key: string]: unknown }) => ({ ...e, rate: parseFloat(e.rate) });

// ─── Lookup rate: per-staff individual rate (highest priority) ─────────────────
async function lookupStaffRate(
  staffId: number, role: string, taskKey: string
): Promise<{ rate: number; rateType: string } | null> {
  const exact = await db.select().from(staffRatePricesTable).where(and(
    eq(staffRatePricesTable.staffId, staffId),
    eq(staffRatePricesTable.role, role),
    eq(staffRatePricesTable.taskKey, taskKey),
  ));
  if (exact.length > 0 && exact[0].rate !== null) {
    return { rate: parseFloat(exact[0].rate!), rateType: exact[0].rateType };
  }
  if (taskKey !== "mac_dinh") {
    const fallback = await db.select().from(staffRatePricesTable).where(and(
      eq(staffRatePricesTable.staffId, staffId),
      eq(staffRatePricesTable.role, role),
      eq(staffRatePricesTable.taskKey, "mac_dinh"),
    ));
    if (fallback.length > 0 && fallback[0].rate !== null) {
      return { rate: parseFloat(fallback[0].rate!), rateType: fallback[0].rateType };
    }
  }
  return null;
}

// ─── Lookup service split for a role (fallback when no per-staff rate) ─────────
async function lookupServiceSplit(
  serviceId: number | null | undefined, role: string
): Promise<{ rate: number; rateType: string } | null> {
  if (!serviceId) return null;
  const rows = await db.select().from(serviceJobSplitsTable).where(and(
    eq(serviceJobSplitsTable.serviceId, serviceId),
    eq(serviceJobSplitsTable.role, role),
  ));
  if (rows.length > 0) {
    return { rate: parseFloat(rows[0].amount), rateType: rows[0].rateType };
  }
  return null;
}

// ─── Lookup service ID by name (for earnings computation) ──────────────────────
async function findServiceIdByName(name: string): Promise<number | null> {
  const rows = await db.select({ id: servicesTable.id }).from(servicesTable)
    .where(eq(servicesTable.name, name));
  return rows.length > 0 ? rows[0].id : null;
}

// ─── Resolve earning for a staff+role: per-staff > service split > null ────────
async function resolveEarning(
  staffId: number, role: string, taskKey: string,
  serviceId: number | null | undefined, bookingTotal: number
): Promise<{ rate: number; rateType: string } | null> {
  // 1. Per-staff individual rate (priority)
  const staffRate = await lookupStaffRate(staffId, role, taskKey);
  if (staffRate) {
    let rate = staffRate.rate;
    if (role === "sale" && staffRate.rateType === "percent") rate = (bookingTotal * staffRate.rate) / 100;
    return { rate, rateType: staffRate.rateType };
  }

  // 2. Service-level split (default)
  const serviceSplit = await lookupServiceSplit(serviceId, role);
  if (serviceSplit) {
    let rate = serviceSplit.rate;
    if (serviceSplit.rateType === "percent") rate = (bookingTotal * serviceSplit.rate) / 100;
    return { rate, rateType: serviceSplit.rateType };
  }

  return null;
}

// ─── Auto-compute earnings for a completed booking ────────────────────────────
export async function computeBookingEarnings(bookingId: number): Promise<void> {
  await db.delete(staffJobEarningsTable).where(and(
    eq(staffJobEarningsTable.bookingId, bookingId),
    eq(staffJobEarningsTable.status, "pending"),
  ));

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) return;

  const earnedDate = booking.shootDate;
  const d = new Date(earnedDate);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  const items = (booking.items || []) as Array<{
    serviceName?: string; serviceId?: number | null; price?: number;
    photoId?: number | null; photoTask?: string;
    makeupId?: number | null; makeupTask?: string;
  }>;
  const bookingTotal = items.reduce((sum, it) => sum + (it.price || 0), 0);
  const assigned = (booking.assignedStaff || {}) as Record<string, unknown>;

  const earnings: Array<{
    bookingId: number; staffId: number; role: string; serviceKey: string;
    serviceName: string; rate: string; earnedDate: string; month: number; year: number;
  }> = [];

  const seen = new Set<string>();
  function addEarning(staffId: number, role: string, taskKey: string, serviceName: string, rate: number) {
    const key = `${staffId}-${role}-${taskKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    earnings.push({ bookingId, staffId, role, serviceKey: taskKey, serviceName, rate: String(rate), earnedDate, month, year });
  }

  // ── Per line: photographer and makeup ─────────────────────────────────────
  for (const item of items) {
    const lineName = item.serviceName || booking.packageType || "Dịch vụ";
    // Resolve serviceId from stored serviceId or by looking up name
    let serviceId = item.serviceId || null;
    if (!serviceId && item.serviceName) {
      serviceId = await findServiceIdByName(item.serviceName);
    }

    if (item.photoId) {
      const taskKey = item.photoTask || "mac_dinh";
      const found = await resolveEarning(item.photoId, "photographer", taskKey, serviceId, item.price || bookingTotal);
      if (found) addEarning(item.photoId, "photographer", taskKey, lineName, found.rate);
    }

    if (item.makeupId) {
      const taskKey = item.makeupTask || "mac_dinh";
      const found = await resolveEarning(item.makeupId, "makeup", taskKey, serviceId, item.price || bookingTotal);
      if (found) addEarning(item.makeupId, "makeup", taskKey, lineName, found.rate);
    }
  }

  // ── Booking-level: sale, photoshop ────────────────────────────────────────
  // Try to get a representative serviceId from the first item
  const firstServiceId = items[0]?.serviceId ||
    (items[0]?.serviceName ? await findServiceIdByName(items[0]?.serviceName || "") : null);

  type BookingRole = "sale" | "photoshop" | "marketing";
  const bookingLevelRoles: Array<{ role: BookingRole; staffKey: string; taskKey: string }> = [
    { role: "sale", staffKey: "sale", taskKey: (assigned.saleTask as string) || "mac_dinh" },
    { role: "photoshop", staffKey: "photoshop", taskKey: (assigned.photoshopTask as string) || "mac_dinh" },
    { role: "marketing", staffKey: "marketing", taskKey: (assigned.marketingTask as string) || "mac_dinh" },
  ];

  for (const { role, staffKey, taskKey } of bookingLevelRoles) {
    const staffId = assigned[staffKey] as number | undefined;
    if (!staffId) continue;

    const found = await resolveEarning(staffId, role, taskKey, firstServiceId, bookingTotal);
    if (!found) continue;

    const serviceName = booking.packageType || items[0]?.serviceName || "Dịch vụ";
    addEarning(staffId, role, taskKey, serviceName, found.rate);
  }

  if (earnings.length > 0) {
    await db.insert(staffJobEarningsTable).values(earnings.map(e => ({ ...e, status: "pending" })));
  }
}

// ─── GET /job-earnings ────────────────────────────────────────────────────────
router.get("/job-earnings", async (req, res) => {
  const staffId = req.query.staffId ? parseInt(req.query.staffId as string) : undefined;
  const month = req.query.month ? parseInt(req.query.month as string) : undefined;
  const year = req.query.year ? parseInt(req.query.year as string) : undefined;

  const rows = await db
    .select({
      id: staffJobEarningsTable.id,
      bookingId: staffJobEarningsTable.bookingId,
      staffId: staffJobEarningsTable.staffId,
      staffName: staffTable.name,
      staffType: staffTable.staffType,
      role: staffJobEarningsTable.role,
      serviceKey: staffJobEarningsTable.serviceKey,
      serviceName: staffJobEarningsTable.serviceName,
      rate: staffJobEarningsTable.rate,
      earnedDate: staffJobEarningsTable.earnedDate,
      month: staffJobEarningsTable.month,
      year: staffJobEarningsTable.year,
      status: staffJobEarningsTable.status,
      notes: staffJobEarningsTable.notes,
      bookingCode: bookingsTable.orderCode,
      customerName: bookingsTable.orderCode,
    })
    .from(staffJobEarningsTable)
    .innerJoin(staffTable, eq(staffJobEarningsTable.staffId, staffTable.id))
    .innerJoin(bookingsTable, eq(staffJobEarningsTable.bookingId, bookingsTable.id))
    .orderBy(desc(staffJobEarningsTable.earnedDate));

  let filtered = rows;
  if (staffId) filtered = filtered.filter(r => r.staffId === staffId);
  if (month) filtered = filtered.filter(r => r.month === month);
  if (year) filtered = filtered.filter(r => r.year === year);

  res.json(filtered.map(fmtEarning));
});

// ─── GET /job-earnings/by-booking/:bookingId ─────────────────────────────────
router.get("/job-earnings/by-booking/:bookingId", async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const rows = await db
    .select({
      id: staffJobEarningsTable.id,
      staffId: staffJobEarningsTable.staffId,
      staffName: staffTable.name,
      staffType: staffTable.staffType,
      role: staffJobEarningsTable.role,
      serviceKey: staffJobEarningsTable.serviceKey,
      serviceName: staffJobEarningsTable.serviceName,
      rate: staffJobEarningsTable.rate,
      status: staffJobEarningsTable.status,
    })
    .from(staffJobEarningsTable)
    .innerJoin(staffTable, eq(staffJobEarningsTable.staffId, staffTable.id))
    .where(eq(staffJobEarningsTable.bookingId, bookingId));
  res.json(rows.map(fmtEarning));
});

// ─── POST /job-earnings/compute/:bookingId ────────────────────────────────────
router.post("/job-earnings/compute/:bookingId", async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  await computeBookingEarnings(bookingId);
  const earnings = await db.select({
    id: staffJobEarningsTable.id,
    staffId: staffJobEarningsTable.staffId,
    staffName: staffTable.name,
    staffType: staffTable.staffType,
    role: staffJobEarningsTable.role,
    serviceName: staffJobEarningsTable.serviceName,
    rate: staffJobEarningsTable.rate,
    status: staffJobEarningsTable.status,
  })
    .from(staffJobEarningsTable)
    .innerJoin(staffTable, eq(staffJobEarningsTable.staffId, staffTable.id))
    .where(eq(staffJobEarningsTable.bookingId, bookingId));
  res.json(earnings.map(fmtEarning));
});

// ─── PUT /job-earnings/:id ────────────────────────────────────────────────────
router.put("/job-earnings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (status !== undefined) update.status = status;
  if (notes !== undefined) update.notes = notes;
  const [row] = await db.update(staffJobEarningsTable).set(update).where(eq(staffJobEarningsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(fmtEarning(row));
});

// ─── GET /job-earnings/summary/:staffId ───────────────────────────────────────
router.get("/job-earnings/summary/:staffId", async (req, res) => {
  const staffId = parseInt(req.params.staffId);
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  const rows = await db.select().from(staffJobEarningsTable)
    .where(and(eq(staffJobEarningsTable.staffId, staffId), eq(staffJobEarningsTable.year, year)));

  const byMonth: Record<number, { month: number; totalEarnings: number; jobCount: number }> = {};
  for (const r of rows) {
    if (!byMonth[r.month]) byMonth[r.month] = { month: r.month, totalEarnings: 0, jobCount: 0 };
    byMonth[r.month].totalEarnings += parseFloat(r.rate);
    byMonth[r.month].jobCount++;
  }

  res.json(Object.values(byMonth).sort((a, b) => a.month - b.month));
});

export default router;
