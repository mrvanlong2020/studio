import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  staffJobEarningsTable, staffSalaryRatesTable, staffSalaryOverridesTable,
  staffTable, bookingsTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

const fmtEarning = (e: { rate: string; [key: string]: unknown }) => ({ ...e, rate: parseFloat(e.rate) });

// ─── Lookup rate for a staffId + role + serviceKey ────────────────────────────
export async function lookupRate(staffId: number, role: string, serviceKey: string): Promise<number> {
  // 1. Check individual override
  const overrides = await db
    .select()
    .from(staffSalaryOverridesTable)
    .where(and(
      eq(staffSalaryOverridesTable.staffId, staffId),
      eq(staffSalaryOverridesTable.serviceKey, serviceKey),
      eq(staffSalaryOverridesTable.role, role),
    ));
  if (overrides.length > 0) return parseFloat(overrides[0].rate);

  // 2. Check default rate for this serviceKey + role
  const specific = await db
    .select()
    .from(staffSalaryRatesTable)
    .where(and(eq(staffSalaryRatesTable.serviceKey, serviceKey), eq(staffSalaryRatesTable.role, role)));
  if (specific.length > 0) return parseFloat(specific[0].rate);

  // 3. Fallback: "default" serviceKey + role
  const fallback = await db
    .select()
    .from(staffSalaryRatesTable)
    .where(and(eq(staffSalaryRatesTable.serviceKey, "default"), eq(staffSalaryRatesTable.role, role)));
  if (fallback.length > 0) return parseFloat(fallback[0].rate);

  return 0;
}

// ─── Auto-compute earnings for a booking ─────────────────────────────────────
export async function computeBookingEarnings(bookingId: number): Promise<void> {
  // Delete existing pending earnings for this booking
  await db
    .delete(staffJobEarningsTable)
    .where(and(eq(staffJobEarningsTable.bookingId, bookingId), eq(staffJobEarningsTable.status, "pending")));

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) return;

  const earnedDate = booking.shootDate;
  const d = new Date(earnedDate);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  // assignedStaff is an object { photographer?: id, makeup?: id, sale?: id, photoshop?: id }
  const assigned = (booking.assignedStaff || {}) as Record<string, number>;
  const items = (booking.items || []) as Array<{
    serviceName?: string; serviceId?: number | null; photoId?: number | null; makeupId?: number | null; price?: number;
  }>;

  const earnings: Array<{
    bookingId: number; staffId: number; role: string; serviceKey: string;
    serviceName: string; rate: string; earnedDate: string; month: number; year: number;
  }> = [];

  // Per-line photographer and makeup
  for (const item of items) {
    const serviceKey = item.serviceName || booking.packageType || booking.serviceCategory;
    const serviceName = item.serviceName || booking.packageType || "Dịch vụ";

    if (item.photoId) {
      const rate = await lookupRate(item.photoId, "photographer", serviceKey);
      earnings.push({ bookingId, staffId: item.photoId, role: "photographer", serviceKey, serviceName, rate: String(rate), earnedDate, month, year });
    }

    if (item.makeupId) {
      const rate = await lookupRate(item.makeupId, "makeup", serviceKey);
      earnings.push({ bookingId, staffId: item.makeupId, role: "makeup", serviceKey, serviceName, rate: String(rate), earnedDate, month, year });
    }
  }

  // Booking-level role assignments (sale, photoshop, marketing)
  const bookingLevelRoles: Array<{ role: string; key: string }> = [
    { role: "sale", key: "sale" },
    { role: "photoshop", key: "photoshop" },
    { role: "marketing", key: "marketing" },
  ];

  for (const { role, key } of bookingLevelRoles) {
    const staffId = assigned[key];
    if (!staffId) continue;
    const serviceKey = booking.packageType || booking.serviceCategory;
    const rate = await lookupRate(staffId, role, serviceKey);
    if (rate > 0) {
      earnings.push({
        bookingId, staffId, role, serviceKey,
        serviceName: booking.packageType || "Dịch vụ",
        rate: String(rate), earnedDate, month, year,
      });
    }
  }

  // Deduplicate by staffId+role and keep highest rate (avoid duplicate items for same person)
  const seen = new Set<string>();
  const deduped = [];
  for (const e of earnings) {
    const key = `${e.staffId}-${e.role}-${e.serviceKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(e);
    }
  }

  if (deduped.length > 0) {
    await db.insert(staffJobEarningsTable).values(deduped.map(e => ({ ...e, status: "pending" })));
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
      customerName: bookingsTable.packageType,
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

// ─── POST /job-earnings/compute/:bookingId — force recompute ──────────────────
router.post("/job-earnings/compute/:bookingId", async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  await computeBookingEarnings(bookingId);
  const earnings = await db
    .select()
    .from(staffJobEarningsTable)
    .where(eq(staffJobEarningsTable.bookingId, bookingId));
  res.json(earnings.map(fmtEarning));
});

// ─── PUT /job-earnings/:id — mark paid ───────────────────────────────────────
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

// ─── GET /job-earnings/summary/:staffId — monthly summary ────────────────────
router.get("/job-earnings/summary/:staffId", async (req, res) => {
  const staffId = parseInt(req.params.staffId);
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  const rows = await db
    .select()
    .from(staffJobEarningsTable)
    .where(and(eq(staffJobEarningsTable.staffId, staffId), eq(staffJobEarningsTable.year, year)));

  // Group by month
  const byMonth: Record<number, { month: number; totalEarnings: number; jobCount: number }> = {};
  for (const r of rows) {
    if (!byMonth[r.month]) byMonth[r.month] = { month: r.month, totalEarnings: 0, jobCount: 0 };
    byMonth[r.month].totalEarnings += parseFloat(r.rate);
    byMonth[r.month].jobCount++;
  }

  res.json(Object.values(byMonth).sort((a, b) => a.month - b.month));
});

export default router;
