import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffTable, staffJobEarningsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (s: {
  salary?: string | null; baseSalaryAmount?: string | null; commissionRate?: string;
  isActive?: number; roles?: unknown; [key: string]: unknown;
}) => ({
  ...s,
  salary: s.salary ? parseFloat(s.salary) : null,
  baseSalaryAmount: s.baseSalaryAmount ? parseFloat(s.baseSalaryAmount) : 0,
  commissionRate: s.commissionRate ? parseFloat(s.commissionRate) : 0,
  isActive: Boolean(s.isActive),
  roles: Array.isArray(s.roles) ? s.roles : (s.roles ? [s.roles] : []),
});

router.get("/staff", async (_req, res) => {
  const staff = await db.select().from(staffTable).orderBy(staffTable.createdAt);
  res.json(staff.map(fmt));
});

router.get("/staff/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [member] = await db.select().from(staffTable).where(eq(staffTable.id, id));
  if (!member) return res.status(404).json({ error: "Không tìm thấy nhân viên" });

  // Get job earnings summary
  const earnings = await db.select().from(staffJobEarningsTable).where(eq(staffJobEarningsTable.staffId, id));
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const today = now.toISOString().slice(0, 10);

  const monthEarnings = earnings.filter(e => e.month === thisMonth && e.year === thisYear);
  const todayEarnings = earnings.filter(e => e.earnedDate === today);

  res.json({
    ...fmt(member),
    earningsSummary: {
      totalJobs: new Set(earnings.map(e => e.bookingId)).size,
      totalEarned: earnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      monthJobs: new Set(monthEarnings.map(e => e.bookingId)).size,
      monthEarned: monthEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
      todayEarned: todayEarnings.reduce((s, e) => s + parseFloat(e.rate), 0),
    },
  });
});

router.post("/staff", async (req, res) => {
  const { name, phone, role, roles, email, salary, baseSalaryAmount, joinDate, isActive, status, notes, salaryNotes } = req.body;
  // status: "active"|"inactive"|"probation" → isActive
  const activeVal = isActive !== undefined ? (isActive ? 1 : 0) : (status === "inactive" || status === "probation" ? 0 : 1);
  const notesVal = [notes, salaryNotes].filter(Boolean).join(" | ") || null;
  const [member] = await db
    .insert(staffTable)
    .values({
      name, phone,
      role: role || (Array.isArray(roles) && roles.length > 0 ? roles[0] : "assistant"),
      roles: Array.isArray(roles) ? roles : [],
      email: email || null,
      salary: salary ? String(salary) : null,
      baseSalaryAmount: baseSalaryAmount ? String(baseSalaryAmount) : "0",
      joinDate: joinDate || null,
      isActive: activeVal,
      notes: notesVal,
    })
    .returning();
  res.status(201).json(fmt(member));
});

router.put("/staff/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, role, roles, email, salary, baseSalaryAmount, joinDate, isActive, status, notes, salaryNotes } = req.body;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (phone !== undefined) update.phone = phone;
  if (role !== undefined) update.role = role;
  if (roles !== undefined) {
    update.roles = Array.isArray(roles) ? roles : [];
    if (!role && Array.isArray(roles) && roles.length > 0) update.role = roles[0];
  }
  if (email !== undefined) update.email = email || null;
  if (salary !== undefined) update.salary = salary ? String(salary) : null;
  if (baseSalaryAmount !== undefined) update.baseSalaryAmount = baseSalaryAmount ? String(baseSalaryAmount) : "0";
  if (joinDate !== undefined) update.joinDate = joinDate || null;
  if (isActive !== undefined) update.isActive = isActive ? 1 : 0;
  else if (status !== undefined) update.isActive = (status === "inactive" || status === "probation") ? 0 : 1;
  // Combine notes + salaryNotes if provided
  if (notes !== undefined || salaryNotes !== undefined) {
    update.notes = [notes, salaryNotes].filter(Boolean).join(" | ") || null;
  }

  const [member] = await db.update(staffTable).set(update).where(eq(staffTable.id, id)).returning();
  if (!member) return res.status(404).json({ error: "Không tìm thấy nhân viên" });
  res.json(fmt(member));
});

router.delete("/staff/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(staffTable).where(eq(staffTable.id, id));
  res.status(204).send();
});

export default router;
