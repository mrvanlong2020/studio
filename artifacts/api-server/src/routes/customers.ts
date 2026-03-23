import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customersTable } from "@workspace/db/schema";
import { eq, ilike, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  const search = req.query.search as string | undefined;
  let customers;
  if (search) {
    customers = await db
      .select()
      .from(customersTable)
      .where(or(ilike(customersTable.name, `%${search}%`), ilike(customersTable.phone, `%${search}%`)));
  } else {
    customers = await db.select().from(customersTable).orderBy(customersTable.createdAt);
  }
  res.json(customers);
});

router.post("/customers", async (req, res) => {
  const { name, phone, email, address, notes } = req.body;
  const [customer] = await db
    .insert(customersTable)
    .values({ name, phone, email, address, notes })
    .returning();
  res.status(201).json(customer);
});

router.get("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

router.put("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, email, address, notes } = req.body;
  const [customer] = await db
    .update(customersTable)
    .set({ name, phone, email, address, notes })
    .where(eq(customersTable.id, id))
    .returning();
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

router.delete("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.status(204).send();
});

export default router;
