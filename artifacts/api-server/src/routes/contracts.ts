import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { contractsTable, customersTable, bookingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/contracts", async (req, res) => {
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const rows = await db
    .select({
      id: contractsTable.id,
      contractCode: contractsTable.contractCode,
      bookingId: contractsTable.bookingId,
      customerId: contractsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: contractsTable.title,
      totalValue: contractsTable.totalValue,
      status: contractsTable.status,
      signedAt: contractsTable.signedAt,
      expiresAt: contractsTable.expiresAt,
      notes: contractsTable.notes,
      createdAt: contractsTable.createdAt,
    })
    .from(contractsTable)
    .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
    .orderBy(desc(contractsTable.createdAt));

  let filtered = rows;
  if (customerId) filtered = filtered.filter(c => c.customerId === customerId);
  res.json(filtered);
});

router.post("/contracts", async (req, res) => {
  const { bookingId, customerId, title, content, status, signedAt, expiresAt, totalValue, notes } = req.body;
  const count = await db.select().from(contractsTable);
  const contractCode = `HD${String(count.length + 1).padStart(4, "0")}`;
  const [contract] = await db
    .insert(contractsTable)
    .values({ contractCode, bookingId: bookingId || null, customerId, title, content: content || "", status: status || "draft", signedAt: signedAt || null, expiresAt: expiresAt || null, totalValue: totalValue ? String(totalValue) : "0", notes })
    .returning();
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  res.status(201).json({ ...contract, customerName: customer.name, customerPhone: customer.phone });
});

router.get("/contracts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({
      id: contractsTable.id,
      contractCode: contractsTable.contractCode,
      bookingId: contractsTable.bookingId,
      customerId: contractsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: contractsTable.title,
      content: contractsTable.content,
      totalValue: contractsTable.totalValue,
      status: contractsTable.status,
      signedAt: contractsTable.signedAt,
      expiresAt: contractsTable.expiresAt,
      fileUrl: contractsTable.fileUrl,
      notes: contractsTable.notes,
      createdAt: contractsTable.createdAt,
    })
    .from(contractsTable)
    .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
    .where(eq(contractsTable.id, id));
  if (!row) return res.status(404).json({ error: "Không tìm thấy hợp đồng" });
  res.json(row);
});

router.put("/contracts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, content, status, signedAt, expiresAt, totalValue, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title;
  if (content !== undefined) update.content = content;
  if (status !== undefined) update.status = status;
  if (signedAt !== undefined) update.signedAt = signedAt;
  if (expiresAt !== undefined) update.expiresAt = expiresAt;
  if (totalValue !== undefined) update.totalValue = String(totalValue);
  if (notes !== undefined) update.notes = notes;
  const [contract] = await db.update(contractsTable).set(update).where(eq(contractsTable.id, id)).returning();
  if (!contract) return res.status(404).json({ error: "Không tìm thấy hợp đồng" });
  res.json(contract);
});

router.delete("/contracts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(contractsTable).where(eq(contractsTable.id, id));
  res.status(204).send();
});

export default router;
