import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { payrollsTable, staffTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (p: { baseSalary: string; showBonus: string; commission: string; bonus: string; deductions: string; advance: string; netSalary: string; [key: string]: unknown }) => ({
  ...p,
  baseSalary: parseFloat(p.baseSalary),
  showBonus: parseFloat(p.showBonus),
  commission: parseFloat(p.commission),
  bonus: parseFloat(p.bonus),
  deductions: parseFloat(p.deductions),
  advance: parseFloat(p.advance),
  netSalary: parseFloat(p.netSalary),
});

router.get("/payrolls", async (req, res) => {
  const staffId = req.query.staffId ? parseInt(req.query.staffId as string) : undefined;
  const month = req.query.month ? parseInt(req.query.month as string) : undefined;
  const year = req.query.year ? parseInt(req.query.year as string) : undefined;

  const rows = await db
    .select({
      id: payrollsTable.id,
      staffId: payrollsTable.staffId,
      staffName: staffTable.name,
      staffRole: staffTable.role,
      month: payrollsTable.month,
      year: payrollsTable.year,
      baseSalary: payrollsTable.baseSalary,
      showBonus: payrollsTable.showBonus,
      commission: payrollsTable.commission,
      bonus: payrollsTable.bonus,
      deductions: payrollsTable.deductions,
      advance: payrollsTable.advance,
      netSalary: payrollsTable.netSalary,
      items: payrollsTable.items,
      status: payrollsTable.status,
      notes: payrollsTable.notes,
      createdAt: payrollsTable.createdAt,
    })
    .from(payrollsTable)
    .innerJoin(staffTable, eq(payrollsTable.staffId, staffTable.id))
    .orderBy(desc(payrollsTable.year), desc(payrollsTable.month));

  let filtered = rows;
  if (staffId) filtered = filtered.filter(p => p.staffId === staffId);
  if (month) filtered = filtered.filter(p => p.month === month);
  if (year) filtered = filtered.filter(p => p.year === year);

  res.json(filtered.map(fmt));
});

router.post("/payrolls", async (req, res) => {
  const { staffId, month, year, baseSalary, showBonus, commission, bonus, deductions, advance, items, notes } = req.body;
  const netSalary = (parseFloat(baseSalary || 0) + parseFloat(showBonus || 0) + parseFloat(commission || 0) + parseFloat(bonus || 0)) - parseFloat(deductions || 0) - parseFloat(advance || 0);
  const [payroll] = await db
    .insert(payrollsTable)
    .values({
      staffId, month, year,
      baseSalary: String(baseSalary || 0),
      showBonus: String(showBonus || 0),
      commission: String(commission || 0),
      bonus: String(bonus || 0),
      deductions: String(deductions || 0),
      advance: String(advance || 0),
      netSalary: String(netSalary),
      items: items || [],
      notes,
      status: "draft",
    })
    .returning();
  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
  res.status(201).json(fmt({ ...payroll, staffName: staff.name, staffRole: staff.role }));
});

router.put("/payrolls/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { baseSalary, showBonus, commission, bonus, deductions, advance, items, status, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (baseSalary !== undefined) update.baseSalary = String(baseSalary);
  if (showBonus !== undefined) update.showBonus = String(showBonus);
  if (commission !== undefined) update.commission = String(commission);
  if (bonus !== undefined) update.bonus = String(bonus);
  if (deductions !== undefined) update.deductions = String(deductions);
  if (advance !== undefined) update.advance = String(advance);
  if (items !== undefined) update.items = items;
  if (status !== undefined) update.status = status;
  if (notes !== undefined) update.notes = notes;
  const bS = parseFloat(String(baseSalary || 0));
  const sB = parseFloat(String(showBonus || 0));
  const cm = parseFloat(String(commission || 0));
  const bn = parseFloat(String(bonus || 0));
  const dd = parseFloat(String(deductions || 0));
  const av = parseFloat(String(advance || 0));
  update.netSalary = String(bS + sB + cm + bn - dd - av);
  const [payroll] = await db.update(payrollsTable).set(update).where(eq(payrollsTable.id, id)).returning();
  if (!payroll) return res.status(404).json({ error: "Không tìm thấy bảng lương" });
  res.json(fmt(payroll));
});

router.delete("/payrolls/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(payrollsTable).where(eq(payrollsTable.id, id));
  res.status(204).send();
});

export default router;
