import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  attendanceLogsTable, attendanceRulesTable, attendanceLateRulesTable,
  attendanceAdjustmentsTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { verifyToken } from "./auth";

const router: IRouter = Router();

const STUDIO_LAT = 11.3101;
const STUDIO_LNG = 106.1074;
const DEFAULT_RADIUS_M = 300;

function getDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Check In ──────────────────────────────────────────────────────────────────
router.post("/attendance/check-in", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const { lat, lng, accuracyM, qrPayload, bookingId } = req.body;

  const settingsR = await pool.query(`SELECT value FROM settings WHERE key = 'studio_lat' OR key = 'studio_lng' OR key = 'attendance_radius_m'`);
  const settingsMap: Record<string, string> = {};
  for (const row of settingsR.rows as { key: string; value: string }[]) {
    settingsMap[row.key] = row.value;
  }
  const studioLat = parseFloat(settingsMap.studio_lat ?? String(STUDIO_LAT));
  const studioLng = parseFloat(settingsMap.studio_lng ?? String(STUDIO_LNG));
  const radiusM = parseFloat(settingsMap.attendance_radius_m ?? String(DEFAULT_RADIUS_M));

  let method: "qr" | "offsite" | "manual" = "qr";
  let distanceM: number | null = null;
  let allowedBookingId: number | null = bookingId ? parseInt(String(bookingId)) : null;

  if (lat !== undefined && lng !== undefined) {
    distanceM = getDistanceM(parseFloat(String(lat)), parseFloat(String(lng)), studioLat, studioLng);
    const inGeofence = distanceM <= radiusM;

    if (!inGeofence) {
      // Kiểm tra có booking offsite hôm nay không
      const today = new Date().toISOString().slice(0, 10);
      const offsite = await pool.query(`
        SELECT id FROM bookings
        WHERE shoot_date = $1
          AND status NOT IN ('cancelled', 'huy')
          AND (
            (assigned_staff @> to_jsonb($2::int))
            OR (assigned_staff->>'photo')::int = $2
            OR (assigned_staff->>'photographer')::int = $2
            OR (assigned_staff->>'makeup')::int = $2
            OR (assigned_staff->>'sale')::int = $2
          )
        LIMIT 1
      `, [today, callerId]);

      if (offsite.rows.length > 0) {
        method = "offsite";
        allowedBookingId = allowedBookingId ?? (offsite.rows[0] as { id: number }).id;
      } else {
        return res.status(400).json({
          error: "Bạn không trong vùng studio và không có lịch chụp ngoài hôm nay",
          distanceM: Math.round(distanceM),
          radiusM,
        });
      }
    }
  }

  // Kiểm tra đã check-in hôm nay chưa
  const today = new Date().toISOString().slice(0, 10);
  const existing = await pool.query(
    `SELECT id FROM attendance_logs WHERE staff_id = $1 AND type = 'check_in' AND created_at::date = $2::date LIMIT 1`,
    [callerId, today]
  );
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "Bạn đã check-in hôm nay rồi" });
  }

  const [log] = await db.insert(attendanceLogsTable).values({
    staffId: callerId,
    type: "check_in",
    method,
    lat: lat !== undefined ? String(lat) : null,
    lng: lng !== undefined ? String(lng) : null,
    accuracyM: accuracyM !== undefined ? String(accuracyM) : null,
    distanceM: distanceM !== null ? String(Math.round(distanceM)) : null,
    bookingId: allowedBookingId,
  }).returning();

  res.status(201).json(log);
});

// ── Check Out ─────────────────────────────────────────────────────────────────
router.post("/attendance/check-out", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const { lat, lng, accuracyM } = req.body;

  const today = new Date().toISOString().slice(0, 10);
  const alreadyOut = await pool.query(
    `SELECT id FROM attendance_logs WHERE staff_id = $1 AND type = 'check_out' AND created_at::date = $2::date LIMIT 1`,
    [callerId, today]
  );
  if (alreadyOut.rows.length > 0) {
    return res.status(400).json({ error: "Bạn đã check-out hôm nay rồi" });
  }

  const [log] = await db.insert(attendanceLogsTable).values({
    staffId: callerId,
    type: "check_out",
    method: "qr",
    lat: lat !== undefined ? String(lat) : null,
    lng: lng !== undefined ? String(lng) : null,
    accuracyM: accuracyM !== undefined ? String(accuracyM) : null,
  }).returning();

  res.status(201).json(log);
});

// ── GET /me: Tổng hợp tháng ──────────────────────────────────────────────────
router.get("/attendance/me", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const month = String(req.query.month || new Date().toISOString().slice(0, 7));

  const logsR = await pool.query(
    `SELECT * FROM attendance_logs WHERE staff_id = $1 AND to_char(created_at, 'YYYY-MM') = $2 ORDER BY created_at`,
    [callerId, month]
  );
  const logs = logsR.rows as Record<string, unknown>[];

  const checkIns = logs.filter(l => l.type === "check_in");
  const checkOuts = logs.filter(l => l.type === "check_out");

  const [rule] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.isActive, 1));
  const checkInTo = rule?.checkInTo ?? "09:00";

  let onTimeCount = 0;
  const days = checkIns.map(ci => {
    const dateStr = String(ci.created_at ?? "").slice(0, 10);
    const timeStr = String(ci.created_at ?? "").slice(11, 16);
    const isOnTime = timeStr <= checkInTo;
    if (isOnTime) onTimeCount++;
    const co = checkOuts.find(x => String(x.created_at ?? "").slice(0, 10) === dateStr);
    return {
      date: dateStr,
      checkIn: timeStr,
      checkOut: co ? String(co.created_at ?? "").slice(11, 16) : null,
      method: ci.method,
      isOnTime,
    };
  });

  const adjustmentsR = await pool.query(
    `SELECT * FROM attendance_adjustments WHERE staff_id = $1 AND to_char(date, 'YYYY-MM') = $2`,
    [callerId, month]
  );
  const adjustments = adjustmentsR.rows as { type: string; amount: string }[];
  const bonusAdj = adjustments.filter(a => a.type === "bonus").reduce((s, a) => s + parseFloat(a.amount), 0);
  const penaltyAdj = adjustments.filter(a => a.type === "penalty").reduce((s, a) => s + parseFloat(a.amount), 0);

  const weeklyBonus = parseFloat(String(rule?.weeklyOnTimeBonus ?? "50000"));
  const weeksOnTime = Math.floor(onTimeCount / 5);
  const earnedBonus = weeksOnTime * weeklyBonus + bonusAdj;

  res.json({
    month,
    totalDays: checkIns.length,
    onTimeCount,
    onTimeRate: checkIns.length > 0 ? Math.round((onTimeCount / checkIns.length) * 100) : 0,
    earnedBonus,
    penalty: penaltyAdj,
    net: earnedBonus - penaltyAdj,
    days,
    adjustments: adjustmentsR.rows,
  });
});

// ── Admin: xem tất cả nhân viên theo tháng ───────────────────────────────────
router.get("/attendance/admin", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });

  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const logsR = await pool.query(
    `SELECT al.*, s.name as staff_name FROM attendance_logs al
     JOIN staff s ON s.id = al.staff_id
     WHERE to_char(al.created_at, 'YYYY-MM') = $1 ORDER BY al.created_at`,
    [month]
  );
  res.json(logsR.rows);
});

// ── Quy tắc chấm công ────────────────────────────────────────────────────────
router.get("/attendance/rules", async (req, res) => {
  const rules = await db.select().from(attendanceRulesTable).orderBy(attendanceRulesTable.id);
  const late = await db.select().from(attendanceLateRulesTable).orderBy(attendanceLateRulesTable.minutesLateMin);
  const fmtRules = rules.map(r => ({
    ...r, weeklyOnTimeBonus: parseFloat(String(r.weeklyOnTimeBonus)),
  }));
  const fmtLate = late.map(l => ({
    ...l, penaltyAmount: l.penaltyAmount ? parseFloat(String(l.penaltyAmount)) : null,
  }));
  res.json({ rules: fmtRules, lateRules: fmtLate });
});

router.put("/attendance/rules", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });

  const { name, checkInFrom, checkInTo, weeklyOnTimeBonus, lateRules } = req.body;
  const [existing] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.isActive, 1));

  let rule;
  if (existing) {
    [rule] = await db.update(attendanceRulesTable)
      .set({ name: name ?? existing.name, checkInFrom: checkInFrom ?? existing.checkInFrom,
             checkInTo: checkInTo ?? existing.checkInTo,
             weeklyOnTimeBonus: String(weeklyOnTimeBonus ?? existing.weeklyOnTimeBonus) })
      .where(eq(attendanceRulesTable.id, existing.id)).returning();
  } else {
    [rule] = await db.insert(attendanceRulesTable)
      .values({ name: name || "Mặc định", checkInFrom: checkInFrom || "07:30",
                checkInTo: checkInTo || "09:00",
                weeklyOnTimeBonus: String(weeklyOnTimeBonus || "50000") })
      .returning();
  }

  if (Array.isArray(lateRules) && rule) {
    await db.delete(attendanceLateRulesTable).where(eq(attendanceLateRulesTable.ruleId, rule.id));
    for (const lr of lateRules) {
      await db.insert(attendanceLateRulesTable).values({
        ruleId: rule.id,
        minutesLateMin: parseInt(String(lr.minutesLateMin ?? 0)),
        minutesLateMax: lr.minutesLateMax ? parseInt(String(lr.minutesLateMax)) : null,
        penaltyAmount: lr.penaltyAmount ? String(lr.penaltyAmount) : null,
      });
    }
  }

  res.json({ rule, lateRules: lateRules || [] });
});

// ── Điều chỉnh thủ công ───────────────────────────────────────────────────────
router.get("/attendance/adjustments", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const staffId = req.query.staffId ? parseInt(String(req.query.staffId)) : callerId;
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));

  const adj = await pool.query(
    `SELECT aa.*, s.name as staff_name FROM attendance_adjustments aa
     LEFT JOIN staff s ON s.id = aa.staff_id
     WHERE aa.staff_id = $1 AND to_char(aa.date, 'YYYY-MM') = $2 ORDER BY aa.date`,
    [staffId, month]
  );
  res.json(adj.rows);
});

router.post("/attendance/adjustments", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });

  const { staffId, date, type, amount, reason } = req.body;
  if (!staffId || !date || !type || amount === undefined) {
    return res.status(400).json({ error: "Thiếu thông tin" });
  }
  const [adj] = await db.insert(attendanceAdjustmentsTable).values({
    staffId: parseInt(String(staffId)), date, type,
    amount: String(amount), reason: reason || null, createdBy: callerId,
  }).returning();
  res.status(201).json(adj);
});

// ── Manual check-in by admin ───────────────────────────────────────────────────
router.post("/attendance/manual", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });

  const { staffId, type = "check_in", notes } = req.body;
  const [log] = await db.insert(attendanceLogsTable).values({
    staffId: parseInt(String(staffId)), type, method: "manual", notes: notes || null,
  }).returning();
  res.status(201).json(log);
});

export default router;
