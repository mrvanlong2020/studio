import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffCastRatesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (r: typeof staffCastRatesTable.$inferSelect) => ({
  id: r.id,
  staffId: r.staffId,
  role: r.role,
  packageId: r.packageId,
  amount: r.amount !== null ? parseFloat(r.amount as string) : null,
});

// GET /staff-cast?staffId=X&role=Y
router.get("/staff-cast", async (req, res) => {
  const staffId = req.query.staffId ? parseInt(req.query.staffId as string) : undefined;
  const role = req.query.role as string | undefined;

  let rows = await db.select().from(staffCastRatesTable);
  if (staffId) rows = rows.filter(r => r.staffId === staffId);
  if (role) rows = rows.filter(r => r.role === role);

  res.json(rows.map(fmt));
});

// POST /staff-cast/upsert — upsert single cast rate
router.post("/staff-cast/upsert", async (req, res) => {
  const { staffId, role, packageId, amount } = req.body;
  if (!staffId || !role || !packageId) {
    return res.status(400).json({ error: "Thiếu staffId, role hoặc packageId" });
  }

  const existing = await db
    .select()
    .from(staffCastRatesTable)
    .where(and(
      eq(staffCastRatesTable.staffId, staffId),
      eq(staffCastRatesTable.role, role),
      eq(staffCastRatesTable.packageId, packageId),
    ));

  const amountVal = amount !== null && amount !== undefined && amount !== "" ? String(amount) : null;

  if (existing.length > 0) {
    const [u] = await db
      .update(staffCastRatesTable)
      .set({ amount: amountVal })
      .where(eq(staffCastRatesTable.id, existing[0].id))
      .returning();
    return res.json(fmt(u));
  } else {
    const [c] = await db
      .insert(staffCastRatesTable)
      .values({ staffId, role, packageId, amount: amountVal })
      .returning();
    return res.status(201).json(fmt(c));
  }
});

// POST /staff-cast/bulk — upsert multiple cast rates for a staff member
router.post("/staff-cast/bulk", async (req, res) => {
  const { staffId, role, rates } = req.body as {
    staffId: number;
    role: string;
    rates: Array<{ packageId: number; amount: number | null }>;
  };

  if (!staffId || !role || !Array.isArray(rates)) {
    return res.status(400).json({ error: "Thiếu staffId, role hoặc rates" });
  }

  const results = [];
  for (const r of rates) {
    const { packageId, amount } = r;
    const existing = await db
      .select()
      .from(staffCastRatesTable)
      .where(and(
        eq(staffCastRatesTable.staffId, staffId),
        eq(staffCastRatesTable.role, role),
        eq(staffCastRatesTable.packageId, packageId),
      ));

    const amountVal = amount !== null && amount !== undefined && String(amount) !== "" ? String(amount) : null;

    if (existing.length > 0) {
      const [u] = await db
        .update(staffCastRatesTable)
        .set({ amount: amountVal })
        .where(eq(staffCastRatesTable.id, existing[0].id))
        .returning();
      results.push(fmt(u));
    } else {
      const [c] = await db
        .insert(staffCastRatesTable)
        .values({ staffId, role, packageId, amount: amountVal })
        .returning();
      results.push(fmt(c));
    }
  }

  res.json(results);
});

// DELETE /staff-cast/:id
router.delete("/staff-cast/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(staffCastRatesTable).where(eq(staffCastRatesTable.id, id));
  res.json({ ok: true });
});

// DELETE /staff-cast/staff/:staffId — xóa toàn bộ cast của một nhân viên
router.delete("/staff-cast/staff/:staffId", async (req, res) => {
  const staffId = parseInt(req.params.staffId);
  await db.delete(staffCastRatesTable).where(eq(staffCastRatesTable.staffId, staffId));
  res.json({ ok: true });
});

export default router;
