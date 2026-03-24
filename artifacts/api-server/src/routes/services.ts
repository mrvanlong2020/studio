import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { servicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (s: { price: string; costPrice: string; isActive: number; [key: string]: unknown }) => ({
  ...s,
  price: parseFloat(s.price),
  costPrice: parseFloat(s.costPrice ?? "0"),
  isActive: Boolean(s.isActive),
});

router.get("/services", async (_req, res) => {
  const services = await db.select().from(servicesTable).orderBy(servicesTable.createdAt);
  res.json(services.map(fmt));
});

router.get("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, id));
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json(fmt(service));
});

router.post("/services", async (req, res) => {
  const { name, code, category, description, type, price, costPrice, duration, includes, isActive } = req.body;
  const [service] = await db
    .insert(servicesTable)
    .values({
      name, code, category: category ?? "other", description,
      type: type ?? "package",
      price: String(price ?? 0),
      costPrice: String(costPrice ?? 0),
      duration, includes: (includes as string[]) ?? [],
      isActive: isActive !== false ? 1 : 0,
    })
    .returning();
  res.status(201).json(fmt(service));
});

router.put("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { name, code, category, description, type, price, costPrice, duration, includes, isActive } = req.body;
  const [service] = await db
    .update(servicesTable)
    .set({
      name, code, category,
      description, type,
      price: price !== undefined ? String(price) : undefined,
      costPrice: costPrice !== undefined ? String(costPrice) : undefined,
      duration,
      includes: includes !== undefined ? (includes as string[]) : undefined,
      isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined,
    })
    .where(eq(servicesTable.id, id))
    .returning();
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json(fmt(service));
});

router.delete("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(servicesTable).where(eq(servicesTable.id, id));
  res.status(204).send();
});

export default router;
