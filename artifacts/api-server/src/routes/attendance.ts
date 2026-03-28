import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  attendanceLogsTable, attendanceRulesTable, attendanceLateRulesTable,
  attendanceAdjustmentsTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { verifyToken } from "./auth";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const QR_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const DOMAIN = process.env.REPLIT_DEV_DOMAIN || "localhost:8080";

function generateQrCode(dateStr: string): string {
  const sig = createHmac("sha256", QR_SECRET).update(`qr:${dateStr}`).digest("hex").slice(0, 16);
  return `AMAZING-QR-${dateStr}-${sig}`;
}

function generateQrUrl(dateStr: string): string {
  const code = generateQrCode(dateStr);
  return `https://${DOMAIN}/attendance/check-in?code=${code}`;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function extractQrCode(payload: string): string {
  try {
    const url = new URL(payload);
    const code = url.searchParams.get("code");
    if (code) return code;
  } catch {}
  return payload;
}

function verifyQrToken(payload: string): boolean {
  if (!QR_SECRET) return false;
  const code = extractQrCode(payload);
  const match = code.match(/^AMAZING-QR-(\d{4}-\d{2}-\d{2})-([0-9a-f]{16})$/);
  if (!match) return false;
  const [, dateStr, providedSig] = match;
  if (dateStr !== todayVN()) return false;
  const expectedSig = createHmac("sha256", QR_SECRET).update(`qr:${dateStr}`).digest("hex").slice(0, 16);
  try {
    return timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));
  } catch { return false; }
}

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

  let qrVerified = false;
  if (qrPayload) {
    qrVerified = verifyQrToken(qrPayload);
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

    if (inGeofence) {
      if (!qrVerified) {
        return res.status(400).json({
          error: "Bạn đang ở trong studio. Vui lòng quét mã QR để chấm công.",
          distanceM: Math.round(distanceM),
          requiresQr: true,
        });
      }
      method = "qr";
    } else {
      const today = todayVN();
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
  } else {
    return res.status(400).json({ error: "Vui lòng cấp quyền GPS để chấm công. QR + GPS đều cần thiết." });
  }

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const existing = await pool.query(
    `SELECT id FROM attendance_logs WHERE staff_id = $1 AND type = 'check_in' AND (created_at + interval '7 hours')::date = $2::date LIMIT 1`,
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

// ── QR Token: generate daily QR URL (admin only) ──────────────────────────────
router.get("/attendance/qr-token", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });

  const todayDateStr = todayVN();
  const url = generateQrUrl(todayDateStr);
  res.json({ url, date: todayDateStr });
});

// ── Check Out ─────────────────────────────────────────────────────────────────
router.post("/attendance/check-out", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const { lat, lng, accuracyM } = req.body;

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const alreadyOut = await pool.query(
    `SELECT id FROM attendance_logs WHERE staff_id = $1 AND type = 'check_out' AND (created_at + interval '7 hours')::date = $2::date LIMIT 1`,
    [callerId, today]
  );
  if (alreadyOut.rows.length > 0) {
    return res.status(400).json({ error: "Bạn đã check-out hôm nay rồi" });
  }

  const checkInR = await pool.query(
    `SELECT method FROM attendance_logs WHERE staff_id = $1 AND type = 'check_in' AND (created_at + interval '7 hours')::date = $2::date LIMIT 1`,
    [callerId, today]
  );
  if (checkInR.rows.length === 0) {
    return res.status(400).json({ error: "Bạn chưa chấm vào hôm nay" });
  }
  const checkoutMethod: "qr" | "offsite" | "manual" = (checkInR.rows[0] as { method: string } | undefined)?.method as "qr" | "offsite" | "manual" ?? "qr";

  const [log] = await db.insert(attendanceLogsTable).values({
    staffId: callerId,
    type: "check_out",
    method: checkoutMethod,
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

  const month = String(req.query.month || todayVN().slice(0, 7));

  const logsR = await pool.query(
    `SELECT id, staff_id, type, method, lat, lng, distance_m, notes, created_at,
            to_char(created_at + interval '7 hours', 'HH24:MI') as local_time,
            to_char(created_at + interval '7 hours', 'YYYY-MM-DD') as local_date
     FROM attendance_logs WHERE staff_id = $1 AND to_char(created_at + interval '7 hours', 'YYYY-MM') = $2 ORDER BY created_at`,
    [callerId, month]
  );
  const logs = (logsR.rows as Record<string, unknown>[]).map(l => ({
    id: l.id,
    staffId: l.staff_id,
    type: l.type,
    method: l.method,
    lat: l.lat,
    lng: l.lng,
    distanceM: l.distance_m != null ? parseFloat(String(l.distance_m)) : null,
    isOffsite: l.method === "offsite",
    notes: l.notes,
    localTime: l.local_time as string,
    localDate: l.local_date as string,
    createdAt: l.created_at instanceof Date ? l.created_at.toISOString() : String(l.created_at ?? ""),
  }));

  const checkIns = logs.filter(l => l.type === "check_in");
  const checkOuts = logs.filter(l => l.type === "check_out");

  const [rule] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.isActive, 1));
  const lateRules = rule
    ? await db.select().from(attendanceLateRulesTable)
        .where(eq(attendanceLateRulesTable.ruleId, rule.id))
        .orderBy(attendanceLateRulesTable.lateFromTime)
    : [];
  const checkInTo = rule?.checkInTo ?? "09:00";

  // Helper: find penalty for a given check-in time (HH:MM in VN timezone)
  // Compares the actual check-in time against lateFromTime/lateToTime ranges
  function findPenalty(localTime: string): number {
    if (!localTime || localTime <= checkInTo) return 0;
    for (const lr of lateRules) {
      const fromTime = lr.lateFromTime ?? "00:00";
      const toTime = lr.lateToTime;
      const inRange = localTime >= fromTime && (toTime === null || localTime < toTime);
      if (inRange) {
        return lr.penaltyAmount ? parseFloat(String(lr.penaltyAmount)) : 0;
      }
    }
    return 0;
  }

  let onTimeCount = 0;
  const bonusPenalty: { type: string; amount: number; description: string; date: string }[] = [];

  checkIns.forEach(ci => {
    const localTime = ci.localTime;
    if (localTime <= checkInTo) {
      onTimeCount++;
    } else {
      const penaltyAmt = findPenalty(localTime);
      const dateStr = ci.localDate ?? ci.createdAt.slice(0, 10);
      if (penaltyAmt > 0) {
        bonusPenalty.push({
          type: "penalty",
          amount: penaltyAmt,
          description: `Đi trễ lúc ${localTime}`,
          date: dateStr,
        });
      }
    }
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

  const [y, mo] = month.split("-").map(Number);
  for (let w = 0; w < weeksOnTime; w++) {
    const weekEnd = new Date(y, mo - 1, (w + 1) * 7);
    bonusPenalty.push({
      type: "bonus",
      amount: weeklyBonus,
      description: `Bonus đúng giờ tuần ${w + 1}`,
      date: weekEnd.toISOString().slice(0, 10),
    });
  }

  bonusPenalty.sort((a, b) => a.date.localeCompare(b.date));

  const latePenaltyTotal = bonusPenalty.filter(bp => bp.type === "penalty").reduce((s, bp) => s + bp.amount, 0);
  const earnedBonus = weeksOnTime * weeklyBonus + bonusAdj;
  const totalPenalty = latePenaltyTotal + penaltyAdj;

  res.json({
    month,
    logs,
    bonusPenalty,
    adjustments: adjRows,
    totalDays: checkIns.length,
    onTimeCount,
    onTimeRate: checkIns.length > 0 ? Math.round((onTimeCount / checkIns.length) * 100) : 0,
    earnedBonus,
    penalty: totalPenalty,
    net: earnedBonus - totalPenalty,
    checkInTo,
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

  const month = String(req.query.month || todayVN().slice(0, 7));
  const logsR = await pool.query(
    `SELECT al.id, al.staff_id, al.type, al.method, al.lat, al.lng, al.accuracy_m, al.distance_m, al.booking_id, al.notes, al.created_at, s.name as staff_name FROM attendance_logs al
     JOIN staff s ON s.id = al.staff_id
     WHERE to_char(al.created_at + interval '7 hours', 'YYYY-MM') = $1 ORDER BY al.created_at`,
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
    createdAt: l.created_at instanceof Date ? (l.created_at as Date).toISOString() : String(l.created_at ?? ""),
  }));
  res.json(mappedRows);
});

// ── Quy tắc chấm công ────────────────────────────────────────────────────────
router.get("/attendance/rules", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền" });
  const [activeRule] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.isActive, 1));
  const late = activeRule
    ? await db.select().from(attendanceLateRulesTable)
        .where(eq(attendanceLateRulesTable.ruleId, activeRule.id))
        .orderBy(attendanceLateRulesTable.lateFromTime)
    : [];
  const fmtLate = late.map(l => ({
    id: l.id,
    ruleId: l.ruleId,
    lateFromTime: l.lateFromTime ?? "08:00",
    lateToTime: l.lateToTime ?? null,
    penaltyAmount: l.penaltyAmount ? parseFloat(String(l.penaltyAmount)) : null,
  }));
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
        lateFromTime: String(lr.lateFromTime ?? "08:00"),
        lateToTime: lr.lateToTime ? String(lr.lateToTime) : null,
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

  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const callerIsAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));

  const parsedStaffId = req.query.staffId ? parseInt(String(req.query.staffId)) : NaN;
  const requestedStaffId = (!isNaN(parsedStaffId) && parsedStaffId > 0) ? parsedStaffId : callerId;
  const staffId = callerIsAdmin ? requestedStaffId : callerId;
  const month = String(req.query.month || todayVN().slice(0, 7));

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
