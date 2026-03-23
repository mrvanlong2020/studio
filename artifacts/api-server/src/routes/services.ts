import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { servicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (s: { price: string; [key: string]: unknown }) => ({
  ...s,
  price: parseFloat(s.price),
  isActive: Boolean((s as { isActive: number }).isActive),
});

router.get("/services", async (_req, res) => {
  const services = await db.select().from(servicesTable).orderBy(servicesTable.createdAt);
  res.json(services.map(fmt));
});

router.post("/services", async (req, res) => {
  const { name, description, type, price, duration, includes, isActive } = req.body;
  const [service] = await db
    .insert(servicesTable)
    .values({ name, description, type, price: String(price), duration, includes: includes as string[], isActive: isActive ? 1 : 0 })
    .returning();
  res.status(201).json(fmt(service));
});

router.put("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, type, price, duration, includes, isActive } = req.body;
  const [service] = await db
    .update(servicesTable)
    .set({ name, description, type, price: price !== undefined ? String(price) : undefined, duration, includes: includes as string[], isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined })
    .where(eq(servicesTable.id, id))
    .returning();
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json(fmt(service));
});

router.delete("/services/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(servicesTable).where(eq(servicesTable.id, id));
  res.status(204).send();
});

export default router;
