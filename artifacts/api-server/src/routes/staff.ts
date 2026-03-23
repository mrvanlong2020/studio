import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (s: { salary?: string | null; isActive?: number; [key: string]: unknown }) => ({
  ...s,
  salary: s.salary ? parseFloat(s.salary) : null,
  isActive: Boolean(s.isActive),
});

router.get("/staff", async (_req, res) => {
  const staff = await db.select().from(staffTable).orderBy(staffTable.createdAt);
  res.json(staff.map(fmt));
});

router.post("/staff", async (req, res) => {
  const { name, phone, role, email, salary, joinDate, isActive, notes } = req.body;
  const [member] = await db
    .insert(staffTable)
    .values({ name, phone, role, email, salary: salary ? String(salary) : null, joinDate, isActive: isActive ? 1 : 0, notes })
    .returning();
  res.status(201).json(fmt(member));
});

router.put("/staff/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, role, email, salary, joinDate, isActive, notes } = req.body;
  const [member] = await db
    .update(staffTable)
    .set({ name, phone, role, email, salary: salary !== undefined ? (salary ? String(salary) : null) : undefined, joinDate, isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined, notes })
    .where(eq(staffTable.id, id))
    .returning();
  if (!member) return res.status(404).json({ error: "Staff not found" });
  res.json(fmt(member));
});

router.delete("/staff/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(staffTable).where(eq(staffTable.id, id));
  res.status(204).send();
});

export default router;
