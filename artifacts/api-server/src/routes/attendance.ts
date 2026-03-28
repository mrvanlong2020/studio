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

  // QR payload validation: accept "AMAZING-QR-{YYYY-MM-DD}" for today's date
  let qrVerified = false;
  if (qrPayload && qrPayload !== "gps-auto") {
    const todayDateStr = new Date().toISOString().slice(0, 10);
    const expectedToken = `AMAZING-QR-${todayDateStr}`;
    qrVerified = qrPayload === expectedToken;
    if (!qrVerified) {
      return res.status(400).json({ error: "Mã QR không hợp lệ hoặc đã hết hạn. Vui lòng quét lại mã QR hôm nay." });
    }
  }

  const settingsR = await pool.query(`SELECT key, value FROM settings WHERE key IN ('studio_lat', 'studio_lng', 'attendance_radius_m')`);
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

// ── QR Token: generate daily QR payload (admin only) ──────────────────────────
router.get("/attendance/qr-token", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });

  const todayDateStr = new Date().toISOString().slice(0, 10);
  const token = `AMAZING-QR-${todayDateStr}`;
  res.json({ token, date: todayDateStr });
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
    `SELECT id, staff_id, type, method, lat, lng, notes, created_at
     FROM attendance_logs WHERE staff_id = $1 AND to_char(created_at, 'YYYY-MM') = $2 ORDER BY created_at`,
    [callerId, month]
  );
  // Return camelCase for frontend; isOffsite derived from method="offsite"
  const logs = (logsR.rows as Record<string, unknown>[]).map(l => ({
    id: l.id,
    staffId: l.staff_id,
    type: l.type,
    method: l.method,
    lat: l.lat,
    lng: l.lng,
    isOffsite: l.method === "offsite",
    notes: l.notes,
    createdAt: String(l.created_at ?? ""),
  }));

  const checkIns = logs.filter(l => l.type === "check_in");
  const checkOuts = logs.filter(l => l.type === "check_out");

  const [rule] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.isActive, 1));
  const checkInTo = rule?.checkInTo ?? "09:00";

  let onTimeCount = 0;
  checkIns.forEach(ci => {
    const timeStr = ci.createdAt.slice(11, 16);
    if (timeStr <= checkInTo) onTimeCount++;
  });

  const adjustmentsR = await pool.query(
    `SELECT id, staff_id, date, type, amount, reason, created_by, created_at
     FROM attendance_adjustments WHERE staff_id = $1 AND to_char(date, 'YYYY-MM') = $2`,
    [callerId, month]
  );
  const adjRows = (adjustmentsR.rows as Record<string, unknown>[]).map(a => ({
    id: a.id,
    staffId: a.staff_id,
    date: a.date,
    type: a.type,
    amount: parseFloat(String(a.amount ?? "0")),
    reason: a.reason,
    createdAt: String(a.created_at ?? ""),
  }));

  const bonusAdj = adjRows.filter(a => a.type === "bonus").reduce((s, a) => s + a.amount, 0);
  const penaltyAdj = adjRows.filter(a => a.type === "penalty").reduce((s, a) => s + a.amount, 0);

  const weeklyBonus = parseFloat(String(rule?.weeklyOnTimeBonus ?? "50000"));
  const weeksOnTime = Math.floor(onTimeCount / 5);

  // Build bonusPenalty array: one entry per week's bonus earned
  const bonusPenalty: { type: string; amount: number; description: string; date: string }[] = [];
  const [y, m] = month.split("-").map(Number);
  for (let w = 0; w < weeksOnTime; w++) {
    const weekEnd = new Date(y, m - 1, (w + 1) * 7);
    bonusPenalty.push({
      type: "bonus",
      amount: weeklyBonus,
      description: `Bonus đúng giờ tuần ${w + 1}`,
      date: weekEnd.toISOString().slice(0, 10),
    });
  }

  const earnedBonus = weeksOnTime * weeklyBonus + bonusAdj;

  res.json({
    month,
    logs,
    bonusPenalty,
    adjustments: adjRows,
    totalDays: checkIns.length,
    onTimeCount,
    onTimeRate: checkIns.length > 0 ? Math.round((onTimeCount / checkIns.length) * 100) : 0,
    earnedBonus,
    penalty: penaltyAdj,
    net: earnedBonus - penaltyAdj,
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
    `SELECT al.id, al.staff_id, al.type, al.method, al.lat, al.lng, al.accuracy_m, al.distance_m, al.booking_id, al.notes, al.created_at, s.name as staff_name FROM attendance_logs al
     JOIN staff s ON s.id = al.staff_id
     WHERE to_char(al.created_at, 'YYYY-MM') = $1 ORDER BY al.created_at`,
    [month]
  );
  const mappedRows = (logsR.rows as Record<string, unknown>[]).map(l => ({
    id: l.id,
    staffId: l.staff_id,
    staffName: l.staff_name,
    type: l.type,
    method: l.method,
    lat: l.lat,
    lng: l.lng,
    accuracyM: l.accuracy_m,
    distanceM: l.distance_m,
    bookingId: l.booking_id,
    isOffsite: l.method === "offsite",
    notes: l.notes,
    createdAt: String(l.created_at ?? ""),
  }));
  res.json(mappedRows);
});

// ── Quy tắc chấm công ────────────────────────────────────────────────────────
router.get("/attendance/rules", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const [activeRule] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.isActive, 1));
  const late = await db.select().from(attendanceLateRulesTable).orderBy(attendanceLateRulesTable.minutesLateMin);
  const fmtLate = late.map(l => ({
    ...l, penaltyAmount: l.penaltyAmount ? parseFloat(String(l.penaltyAmount)) : null,
  }));
  // Map backend field names to frontend-expected contract
  const rule = activeRule ? {
    id: activeRule.id,
    name: activeRule.name,
    checkinStartTime: activeRule.checkInFrom ?? "07:30",
    checkinEndTime: activeRule.checkInTo ?? "09:00",
    workStartTime: "08:00",
    checkoutTime: "17:30",
    weeklyBonusAmount: parseFloat(String(activeRule.weeklyOnTimeBonus ?? "50000")),
    isActive: activeRule.isActive,
  } : null;
  res.json({ rule, lateRules: fmtLate });
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
