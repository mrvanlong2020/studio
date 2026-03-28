import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  staffTable, staffJobEarningsTable, staffRatePricesTable,
  staffLeaveRequestsTable, staffInternalNotesTable,
  staffKpiConfigTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// ─── Helper: build profile data for a staff ID (shared by /me and /:id) ──────
async function buildProfileData(staffId: number) {
  const [member] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
  if (!member) return null;

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${thisYear}-${String(thisMonth).padStart(2, "0")}-01`;

  const arrJson = JSON.stringify([staffId]);
  const jobsResult = await pool.query(`
    SELECT b.id, b.shoot_date, b.package_type, b.status, b.total_amount, b.assigned_staff,
      b.service_label, b.is_parent_contract, b.parent_id,
      c.name AS customer_name, c.phone AS customer_phone
    FROM bookings b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE (b.assigned_staff @> $2::jsonb)
      OR (jsonb_typeof(b.assigned_staff) = 'object' AND (
        (b.assigned_staff->>'photo')::int = $1 OR (b.assigned_staff->>'photographer')::int = $1
        OR (b.assigned_staff->>'makeup')::int = $1 OR (b.assigned_staff->>'sale')::int = $1
        OR (b.assigned_staff->>'photoshop')::int = $1
      ))
    ORDER BY b.shoot_date DESC LIMIT 200
  `, [staffId, arrJson]);

  const STATUS_MAP: Record<string, string> = {
    completed: "completed", hoan_thanh: "completed", done: "completed",
    cancelled: "cancelled", huy: "cancelled",
    pending: "pending", confirmed: "confirmed", in_progress: "in_progress",
  };
  const normalizeStatus = (s: string) => STATUS_MAP[s?.toLowerCase()] ?? "pending";

  const allJobs = jobsResult.rows.map((r: Record<string, unknown>) => {
    const assigned = r.assigned_staff as Record<string, unknown> | unknown[];
    const roles: string[] = [];
    const roleTasks: Record<string, string> = {};
    if (Array.isArray(assigned)) {
      if (assigned.includes(staffId) || assigned.map(Number).includes(staffId)) roles.push("unknown");
    } else if (assigned && typeof assigned === "object") {
      const a = assigned as Record<string, unknown>;
      if (String(a.photo) === String(staffId)) { roles.push("photo"); if (a.photoTask) roleTasks.photo = String(a.photoTask); }
      if (String(a.photographer) === String(staffId)) { roles.push("photo"); if (a.photographerTask) roleTasks.photo = String(a.photographerTask); }
      if (String(a.makeup) === String(staffId)) { roles.push("makeup"); if (a.makeupTask) roleTasks.makeup = String(a.makeupTask); }
      if (String(a.sale) === String(staffId)) { roles.push("sale"); if (a.saleTask) roleTasks.sale = String(a.saleTask); }
      if (String(a.photoshop) === String(staffId)) { roles.push("photoshop"); if (a.photoshopTask) roleTasks.photoshop = String(a.photoshopTask); }
    }
    return {
      id: r.id, shootDate: r.shoot_date, packageType: r.package_type,
      serviceLabel: r.service_label, status: r.status,
      totalAmount: parseFloat(String(r.total_amount || 0)),
      customerName: r.customer_name, customerPhone: r.customer_phone,
      roles, roleTasks, isParentContract: Boolean(r.is_parent_contract), parentId: r.parent_id,
    };
  });

  const monthJobs = allJobs.filter(j => {
    const d = String(j.shootDate || "");
    return d >= monthStart && d <= today.slice(0, 7) + "-31";
  });
  const todayJobs = allJobs.filter(j => String(j.shootDate) === today);
  const monthStats = {
    total: monthJobs.length,
    completed: monthJobs.filter(j => normalizeStatus(String(j.status)) === "completed").length,
    pending: monthJobs.filter(j => ["pending", "confirmed"].includes(normalizeStatus(String(j.status)))).length,
    inProgress: monthJobs.filter(j => normalizeStatus(String(j.status)) === "in_progress").length,
    cancelled: monthJobs.filter(j => normalizeStatus(String(j.status)) === "cancelled").length,
  };

  const earnings = await db.select().from(staffJobEarningsTable)
    .where(eq(staffJobEarningsTable.staffId, staffId))
    .orderBy(desc(staffJobEarningsTable.createdAt));

  const monthEarnings = earnings.filter(e => e.month === thisMonth && e.year === thisYear);
  const todayEarnings = earnings.filter(e => e.earnedDate === today);

  const rates = await db.select().from(staffRatePricesTable)
    .where(eq(staffRatePricesTable.staffId, staffId))
    .orderBy(staffRatePricesTable.role, staffRatePricesTable.taskKey);

  const leaves = await db.select().from(staffLeaveRequestsTable)
    .where(eq(staffLeaveRequestsTable.staffId, staffId))
    .orderBy(desc(staffLeaveRequestsTable.createdAt));

  const [internalNotes] = await db.select().from(staffInternalNotesTable)
    .where(eq(staffInternalNotesTable.staffId, staffId));

  return {
    staff: fmtStaff(member as unknown as Record<string, unknown>),
    monthStats, monthJobs, todayJobs, jobHistory: allJobs,
    earnings: {
      thisMonth: monthEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      today: todayEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      total: earnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      records: monthEarnings.map(e => ({ ...e, rate: parseFloat(e.rate) })),
    },
    rates: rates.map(r => ({ ...r, rate: r.rate ? parseFloat(r.rate) : null })),
    leaveRequests: leaves,
    internalNotes: internalNotes || null,
  };
}

const fmtStaff = (s: Record<string, unknown>) => ({
  ...s,
  salary: s.salary ? parseFloat(s.salary as string) : null,
  baseSalaryAmount: s.baseSalaryAmount ? parseFloat(s.baseSalaryAmount as string) : 0,
  commissionRate: s.commissionRate ? parseFloat(s.commissionRate as string) : 0,
  isActive: Boolean(s.isActive),
  roles: Array.isArray(s.roles) ? s.roles : (s.roles ? [s.roles] : []),
});

// ── /me: Hồ sơ cá nhân (nhân viên tự xem chính mình) ─────────────────────────
router.get("/staff/me", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const data = await buildProfileData(callerId);
  if (!data) return res.status(404).json({ error: "Không tìm thấy hồ sơ" });
  res.json(data);
});

// Alias kept for backward compat with existing frontend
router.get("/staff/me/profile", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const data = await buildProfileData(callerId);
  if (!data) return res.status(404).json({ error: "Không tìm thấy hồ sơ" });
  res.json(data);
});

// ── /me/metrics: Số liệu theo tháng ──────────────────────────────────────────
router.get("/staff/me/metrics", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const now = new Date();
  const month = parseInt(String(req.query.month)) || now.getMonth() + 1;
  const year = parseInt(String(req.query.year)) || now.getFullYear();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const earnings = await db.select().from(staffJobEarningsTable)
    .where(eq(staffJobEarningsTable.staffId, callerId));
  const monthEarnings = earnings.filter(e => e.month === month && e.year === year);

  // Earnings by week within the month (week 1..5)
  const byWeek: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  monthEarnings.forEach(e => {
    const day = parseInt((e.earnedDate || "").slice(8, 10)) || 1;
    const week = Math.ceil(day / 7);
    byWeek[Math.min(week, 5)] = (byWeek[Math.min(week, 5)] || 0) + parseFloat(e.rate);
  });

  const arrJson = JSON.stringify([callerId]);
  const jobsR = await pool.query(`
    SELECT b.id, b.status, b.shoot_date FROM bookings b
    WHERE shoot_date LIKE $1
      AND ((b.assigned_staff @> $2::jsonb)
        OR (jsonb_typeof(b.assigned_staff) = 'object' AND (
          (b.assigned_staff->>'photo')::int = $3 OR (b.assigned_staff->>'photographer')::int = $3
          OR (b.assigned_staff->>'makeup')::int = $3 OR (b.assigned_staff->>'sale')::int = $3
          OR (b.assigned_staff->>'photoshop')::int = $3
        )))
  `, [monthStr + "%", arrJson, callerId]);

  const STATUS_MAP: Record<string, string> = {
    completed: "completed", hoan_thanh: "completed", done: "completed",
    cancelled: "cancelled", huy: "cancelled",
    pending: "pending", confirmed: "confirmed", in_progress: "in_progress",
  };
  const ns = (s: string) => STATUS_MAP[s?.toLowerCase()] ?? "pending";

  const jobs = jobsR.rows as { status: string }[];
  res.json({
    month, year,
    jobs: {
      total: jobs.length,
      completed: jobs.filter(j => ns(j.status) === "completed").length,
      pending: jobs.filter(j => ["pending", "confirmed"].includes(ns(j.status))).length,
      inProgress: jobs.filter(j => ns(j.status) === "in_progress").length,
      cancelled: jobs.filter(j => ns(j.status) === "cancelled").length,
    },
    earnings: {
      thisMonth: monthEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      byWeek: Object.entries(byWeek).map(([w, v]) => ({ week: `T${w}`, amount: v })),
    },
  });
});

// ── /me/kpi: KPI targets vs actual ────────────────────────────────────────────
router.get("/staff/me/kpi", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const now = new Date();
  const month = parseInt(String(req.query.month)) || now.getMonth() + 1;
  const year = parseInt(String(req.query.year)) || now.getFullYear();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const kpiConfigs = await db.select().from(staffKpiConfigTable)
    .where(eq(staffKpiConfigTable.staffId, callerId));

  const earnings = await db.select().from(staffJobEarningsTable)
    .where(eq(staffJobEarningsTable.staffId, callerId));
  const monthEarnings = earnings.filter(e => e.month === month && e.year === year);

  const arrJson = JSON.stringify([callerId]);
  const jobsR = await pool.query(`
    SELECT b.id, b.status FROM bookings b
    WHERE shoot_date LIKE $1
      AND ((b.assigned_staff @> $2::jsonb)
        OR (jsonb_typeof(b.assigned_staff) = 'object' AND (
          (b.assigned_staff->>'photo')::int = $3 OR (b.assigned_staff->>'photographer')::int = $3
          OR (b.assigned_staff->>'makeup')::int = $3 OR (b.assigned_staff->>'sale')::int = $3
          OR (b.assigned_staff->>'photoshop')::int = $3
        )))
  `, [monthStr + "%", arrJson, callerId]);

  const STATUS_MAP: Record<string, string> = {
    completed: "completed", hoan_thanh: "completed", done: "completed",
  };
  const completedJobs = (jobsR.rows as { status: string }[]).filter(j => STATUS_MAP[j.status?.toLowerCase()]);
  const totalEarnings = monthEarnings.reduce((s, e) => s + parseFloat(e.rate), 0);

  const metrics: Array<{ metric: string; target: number; actual: number; score: number; status: "green" | "yellow" | "red"; bonusAmount: number }> = kpiConfigs
    .filter(k => k.isActive)
    .map(k => {
      const target = parseFloat(k.targetValue);
      const actual = k.metric === "jobs_count" ? completedJobs.length
        : k.metric === "earnings" ? totalEarnings : 0;
      const ratio = target > 0 ? Math.min(actual / target, 1.5) : 0;
      const score = Math.round(ratio * 100);
      const status = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
      return { metric: k.metric, target, actual, score, status, bonusAmount: parseFloat(k.bonusAmount) };
    });

  const overallScore = metrics.length > 0
    ? Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length)
    : 0;
  const overallStatus: "green" | "yellow" | "red" = overallScore >= 80 ? "green" : overallScore >= 50 ? "yellow" : "red";

  res.json({ month, year, metrics, overallScore, overallStatus });
});

// ── PATCH /staff/me: Cập nhật hồ sơ bản thân (avatar, email, phone, name) ────
router.patch("/staff/me", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const { avatar, email, phone, name } = req.body as {
    avatar?: string; email?: string; phone?: string; name?: string;
  };
  const update: Record<string, unknown> = {};
  if (avatar !== undefined) update.avatar = avatar || null;
  if (email !== undefined) update.email = email || null;
  if (phone !== undefined) update.phone = phone || null;
  if (name !== undefined) update.name = name || null;

  if (Object.keys(update).length === 0) return res.status(400).json({ error: "Không có dữ liệu để cập nhật" });

  const [member] = await db.update(staffTable).set(update).where(eq(staffTable.id, callerId)).returning();
  if (!member) return res.status(404).json({ error: "Không tìm thấy nhân viên" });

  const { passwordHash: _ph, ...safe } = member as typeof member & { passwordHash?: unknown };
  void _ph;
  res.json(safe);
});

// ── /me: Đổi mật khẩu ────────────────────────────────────────────────────────
router.patch("/staff/me/password", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 4 ký tự" });

  const r = await pool.query(`SELECT password_hash FROM staff WHERE id = $1`, [callerId]);
  const existing = (r.rows[0] as Record<string, unknown>)?.password_hash as string | null;

  // Always require currentPassword when a hash exists — never bypass verification
  if (existing) {
    if (!currentPassword) return res.status(400).json({ error: "Vui lòng nhập mật khẩu hiện tại" });
    const bcrypt = await import("bcryptjs");
    const matches = await bcrypt.compare(currentPassword, existing);
    if (!matches) return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" });
  }

  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query(`UPDATE staff SET password_hash = $1 WHERE id = $2`, [hash, callerId]);
  res.json({ success: true });
});

// ── Lấy toàn bộ dữ liệu hồ sơ nhân viên ──────────────────────────────────────
// Row-level security: chỉ admin hoặc chính nhân viên đó được xem
router.get("/staff/:id/profile", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const staffId = parseInt(req.params.id);
  if (isNaN(staffId)) return res.status(400).json({ error: "ID không hợp lệ" });

  // Check if caller is admin or viewing their own profile
  const callerR = await pool.query(`SELECT role FROM staff WHERE id = $1`, [callerId]);
  const callerRole = (callerR.rows[0] as { role?: string })?.role;
  if (callerRole !== "admin" && callerId !== staffId) {
    return res.status(403).json({ error: "Không có quyền xem hồ sơ này" });
  }

  const [member] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
  if (!member) return res.status(404).json({ error: "Không tìm thấy nhân viên" });

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${thisYear}-${String(thisMonth).padStart(2, "0")}-01`;

  // ── Jobs của nhân viên (query JSONB – hỗ trợ cả format array [id] và object {photo:id}) ──
  const arrJson = JSON.stringify([staffId]);
  const jobsResult = await pool.query(`
    SELECT
      b.id, b.shoot_date, b.package_type, b.status, b.total_amount, b.assigned_staff,
      b.service_label, b.is_parent_contract, b.parent_id,
      c.name AS customer_name, c.phone AS customer_phone
    FROM bookings b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE
      (b.assigned_staff @> $2::jsonb)
      OR (jsonb_typeof(b.assigned_staff) = 'object' AND (
        (b.assigned_staff->>'photo')::int = $1
        OR (b.assigned_staff->>'photographer')::int = $1
        OR (b.assigned_staff->>'makeup')::int = $1
        OR (b.assigned_staff->>'sale')::int = $1
        OR (b.assigned_staff->>'photoshop')::int = $1
      ))
    ORDER BY b.shoot_date DESC
    LIMIT 200
  `, [staffId, arrJson]);

  const allJobs = jobsResult.rows.map((r: Record<string, unknown>) => {
    const assigned = r.assigned_staff as Record<string, unknown> | unknown[];
    const roles: string[] = [];
    const roleTasks: Record<string, string> = {};
    if (Array.isArray(assigned)) {
      // Định dạng cũ: mảng ID — không biết vai trò cụ thể
      if (assigned.includes(staffId) || assigned.map(Number).includes(staffId)) {
        roles.push("unknown");
      }
    } else if (assigned && typeof assigned === "object") {
      const a = assigned as Record<string, unknown>;
      if (String(a.photo) === String(staffId)) { roles.push("photo"); if (a.photoTask) roleTasks.photo = String(a.photoTask); }
      if (String(a.photographer) === String(staffId)) { roles.push("photo"); if (a.photographerTask) roleTasks.photo = String(a.photographerTask); }
      if (String(a.makeup) === String(staffId)) { roles.push("makeup"); if (a.makeupTask) roleTasks.makeup = String(a.makeupTask); }
      if (String(a.sale) === String(staffId)) { roles.push("sale"); if (a.saleTask) roleTasks.sale = String(a.saleTask); }
      if (String(a.photoshop) === String(staffId)) { roles.push("photoshop"); if (a.photoshopTask) roleTasks.photoshop = String(a.photoshopTask); }
    }
    return {
      id: r.id,
      shootDate: r.shoot_date,
      packageType: r.package_type,
      serviceLabel: r.service_label,
      status: r.status,
      totalAmount: parseFloat(String(r.total_amount || 0)),
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      roles,
      roleTasks,
      isParentContract: Boolean(r.is_parent_contract),
      parentId: r.parent_id,
    };
  });

  // ── Phân loại job tháng này ───────────────────────────────────────────────
  const monthJobs = allJobs.filter(j => {
    const d = String(j.shootDate || "");
    return d >= monthStart && d <= today.slice(0, 7) + "-31";
  });

  const todayJobs = allJobs.filter(j => String(j.shootDate) === today);

  const STATUS_MAP: Record<string, string> = {
    completed: "completed",
    hoan_thanh: "completed",
    done: "completed",
    cancelled: "cancelled",
    huy: "cancelled",
    pending: "pending",
    confirmed: "confirmed",
    in_progress: "in_progress",
  };

  const normalizeStatus = (s: string) => STATUS_MAP[s?.toLowerCase()] ?? "pending";

  const monthStats = {
    total: monthJobs.length,
    completed: monthJobs.filter(j => normalizeStatus(String(j.status)) === "completed").length,
    pending: monthJobs.filter(j => ["pending", "confirmed"].includes(normalizeStatus(String(j.status)))).length,
    inProgress: monthJobs.filter(j => normalizeStatus(String(j.status)) === "in_progress").length,
    cancelled: monthJobs.filter(j => normalizeStatus(String(j.status)) === "cancelled").length,
  };

  // ── Thu nhập từ staff_job_earnings ────────────────────────────────────────
  const earnings = await db.select().from(staffJobEarningsTable)
    .where(eq(staffJobEarningsTable.staffId, staffId))
    .orderBy(desc(staffJobEarningsTable.createdAt));

  const monthEarnings = earnings.filter(e => e.month === thisMonth && e.year === thisYear);
  const todayEarnings = earnings.filter(e => e.earnedDate === today);

  // ── Bảng giá cá nhân ─────────────────────────────────────────────────────
  const rates = await db.select().from(staffRatePricesTable)
    .where(eq(staffRatePricesTable.staffId, staffId))
    .orderBy(staffRatePricesTable.role, staffRatePricesTable.taskKey);

  // ── Đơn xin nghỉ ──────────────────────────────────────────────────────────
  const leaves = await db.select().from(staffLeaveRequestsTable)
    .where(eq(staffLeaveRequestsTable.staffId, staffId))
    .orderBy(desc(staffLeaveRequestsTable.createdAt));

  // ── Ghi chú nội bộ ────────────────────────────────────────────────────────
  const [internalNotes] = await db.select().from(staffInternalNotesTable)
    .where(eq(staffInternalNotesTable.staffId, staffId));

  res.json({
    staff: fmtStaff(member as unknown as Record<string, unknown>),
    monthStats,
    monthJobs,
    todayJobs,
    jobHistory: allJobs,
    earnings: {
      thisMonth: monthEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      today: todayEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      total: earnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      records: monthEarnings.map(e => ({
        ...e,
        rate: parseFloat(e.rate),
      })),
    },
    rates: rates.map(r => ({
      ...r,
      rate: r.rate ? parseFloat(r.rate) : null,
    })),
    leaveRequests: leaves,
    internalNotes: internalNotes || null,
  });
});

// ── Helper: check if caller is admin ──────────────────────────────────────────
async function isCallerAdmin(callerId: number): Promise<boolean> {
  const r = await pool.query(`SELECT role FROM staff WHERE id = $1`, [callerId]);
  return (r.rows[0] as { role?: string })?.role === "admin";
}

// ── Đơn xin nghỉ ──────────────────────────────────────────────────────────────
// GET: admin or self can view leave requests
router.get("/staff/:id/leave-requests", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const staffId = parseInt(req.params.id);
  if (!(await isCallerAdmin(callerId)) && callerId !== staffId) {
    return res.status(403).json({ error: "Không có quyền xem đơn của người khác" });
  }
  const leaves = await db.select().from(staffLeaveRequestsTable)
    .where(eq(staffLeaveRequestsTable.staffId, staffId))
    .orderBy(desc(staffLeaveRequestsTable.createdAt));
  res.json(leaves);
});

// POST: staff can only submit their own leave request
router.post("/staff/:id/leave-requests", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const staffId = parseInt(req.params.id);
  if (!(await isCallerAdmin(callerId)) && callerId !== staffId) {
    return res.status(403).json({ error: "Chỉ được nộp đơn xin nghỉ của chính mình" });
  }
  const { startDate, endDate, reason, notes } = req.body;
  if (!startDate || !endDate || !reason?.trim()) {
    return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
  }
  const [created] = await db.insert(staffLeaveRequestsTable)
    .values({ staffId, startDate, endDate, reason, notes: notes || null })
    .returning();
  res.status(201).json(created);
});

// PUT: admin only (approve/reject leave requests)
router.put("/leave-requests/:id", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  if (!(await isCallerAdmin(callerId))) {
    return res.status(403).json({ error: "Chỉ admin mới có thể duyệt/từ chối đơn xin nghỉ" });
  }
  const id = parseInt(req.params.id);
  const { status, approvedByName, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (approvedByName !== undefined) update.approvedByName = approvedByName;
  if (notes !== undefined) update.notes = notes;
  if (status && status !== "pending") update.reviewedAt = new Date();

  const [updated] = await db.update(staffLeaveRequestsTable)
    .set(update).where(eq(staffLeaveRequestsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Không tìm thấy đơn" });
  res.json(updated);
});

// ── Ghi chú nội bộ: admin-only ────────────────────────────────────────────────
router.get("/staff/:id/internal-notes", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  if (!(await isCallerAdmin(callerId))) {
    return res.status(403).json({ error: "Chỉ admin mới có thể xem ghi chú nội bộ" });
  }
  const staffId = parseInt(req.params.id);
  const [notes] = await db.select().from(staffInternalNotesTable)
    .where(eq(staffInternalNotesTable.staffId, staffId));
  res.json(notes || null);
});

router.put("/staff/:id/internal-notes", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  if (!(await isCallerAdmin(callerId))) {
    return res.status(403).json({ error: "Chỉ admin mới có thể cập nhật ghi chú nội bộ" });
  }
  const staffId = parseInt(req.params.id);
  const { skillsStrong, workNotes, internalRating, generalNotes } = req.body;
  const [existing] = await db.select().from(staffInternalNotesTable)
    .where(eq(staffInternalNotesTable.staffId, staffId));

  const data = {
    skillsStrong: skillsStrong ?? null,
    workNotes: workNotes ?? null,
    internalRating: internalRating ?? null,
    generalNotes: generalNotes ?? null,
    updatedAt: new Date(),
  };

  let result;
  if (existing) {
    [result] = await db.update(staffInternalNotesTable)
      .set(data).where(eq(staffInternalNotesTable.staffId, staffId)).returning();
  } else {
    [result] = await db.insert(staffInternalNotesTable)
      .values({ staffId, ...data }).returning();
  }
  res.json(result);
});

export default router;
