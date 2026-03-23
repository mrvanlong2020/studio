import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { quotesTable, customersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const formatQuote = (row: { totalAmount: string; discount: string; finalAmount: string; [key: string]: unknown }) => ({
  ...row,
  totalAmount: parseFloat(row.totalAmount),
  discount: parseFloat(row.discount),
  finalAmount: parseFloat(row.finalAmount),
});

router.get("/quotes", async (req, res) => {
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const status = req.query.status as string | undefined;

  const rows = await db
    .select({
      id: quotesTable.id,
      customerId: quotesTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: quotesTable.title,
      items: quotesTable.items,
      totalAmount: quotesTable.totalAmount,
      discount: quotesTable.discount,
      finalAmount: quotesTable.finalAmount,
      status: quotesTable.status,
      validUntil: quotesTable.validUntil,
      notes: quotesTable.notes,
      createdAt: quotesTable.createdAt,
    })
    .from(quotesTable)
    .innerJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .orderBy(quotesTable.createdAt);

  let filtered = rows;
  if (customerId) filtered = filtered.filter((q) => q.customerId === customerId);
  if (status) filtered = filtered.filter((q) => q.status === status);

  res.json(filtered.map(formatQuote));
});

router.post("/quotes", async (req, res) => {
  const { customerId, title, items, discount, validUntil, notes } = req.body;
  const totalAmount = (items as { total: number }[]).reduce((sum, i) => sum + i.total, 0);
  const finalAmount = totalAmount - (discount || 0);

  const [quote] = await db
    .insert(quotesTable)
    .values({
      customerId,
      title,
      items: items as { name: string; quantity: number; unitPrice: number; total: number }[],
      totalAmount: String(totalAmount),
      discount: String(discount || 0),
      finalAmount: String(finalAmount),
      validUntil,
      notes,
      status: "draft",
    })
    .returning();

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  res.status(201).json(formatQuote({ ...quote, customerName: customer.name, customerPhone: customer.phone }));
});

router.get("/quotes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({
      id: quotesTable.id,
      customerId: quotesTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: quotesTable.title,
      items: quotesTable.items,
      totalAmount: quotesTable.totalAmount,
      discount: quotesTable.discount,
      finalAmount: quotesTable.finalAmount,
      status: quotesTable.status,
      validUntil: quotesTable.validUntil,
      notes: quotesTable.notes,
      createdAt: quotesTable.createdAt,
    })
    .from(quotesTable)
    .innerJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(eq(quotesTable.id, id));

  if (!row) return res.status(404).json({ error: "Quote not found" });
  res.json(formatQuote(row));
});

router.put("/quotes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, items, discount, status, validUntil, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title;
  if (status !== undefined) update.status = status;
  if (validUntil !== undefined) update.validUntil = validUntil;
  if (notes !== undefined) update.notes = notes;
  if (items !== undefined) {
    const totalAmount = (items as { total: number }[]).reduce((sum, i) => sum + i.total, 0);
    const finalAmount = totalAmount - (discount || 0);
    update.items = items;
    update.totalAmount = String(totalAmount);
    update.discount = String(discount || 0);
    update.finalAmount = String(finalAmount);
  }

  const [quote] = await db.update(quotesTable).set(update).where(eq(quotesTable.id, id)).returning();
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, quote.customerId));
  res.json(formatQuote({ ...quote, customerName: customer.name, customerPhone: customer.phone }));
});

router.delete("/quotes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(quotesTable).where(eq(quotesTable.id, id));
  res.status(204).send();
});

export default router;
