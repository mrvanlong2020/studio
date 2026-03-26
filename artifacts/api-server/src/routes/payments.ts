import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentsTable, bookingsTable, customersTable } from "@workspace/db/schema";
import { eq, or, ilike, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /payments — danh sách phiếu thu (lọc theo bookingId hoặc rentalId)
router.get("/payments", async (req, res) => {
  const bookingId = req.query.bookingId ? parseInt(req.query.bookingId as string) : undefined;
  const rentalId  = req.query.rentalId  ? parseInt(req.query.rentalId  as string) : undefined;

  let query = db.select().from(paymentsTable).$dynamic();
  if (bookingId) query = query.where(eq(paymentsTable.bookingId, bookingId));
  else if (rentalId) query = query.where(eq(paymentsTable.rentalId, rentalId));

  const payments = await query.orderBy(desc(paymentsTable.paidAt));
  res.json(payments.map(p => ({ ...p, amount: parseFloat(p.amount) })));
});

// GET /payments/search?q=... — tìm đơn hàng cần thu theo tên/SĐT/mã đơn
router.get("/payments/search", async (req, res) => {
  const q = ((req.query.q as string) || "").trim();
  if (!q) { res.json([]); return; }

  const rows = await db
    .select({
      id:              bookingsTable.id,
      orderCode:       bookingsTable.orderCode,
      customerId:      bookingsTable.customerId,
      customerName:    customersTable.name,
      customerPhone:   customersTable.phone,
      customerCode:    customersTable.customCode,
      packageType:     bookingsTable.packageType,
      totalAmount:     bookingsTable.totalAmount,
      paidAmount:      bookingsTable.paidAmount,
      remainingAmount: bookingsTable.remainingAmount,
      status:          bookingsTable.status,
      shootDate:       bookingsTable.shootDate,
      notes:           bookingsTable.notes,
    })
    .from(bookingsTable)
    .leftJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(
      or(
        ilike(customersTable.name,  `%${q}%`),
        ilike(customersTable.phone, `%${q}%`),
        ilike(bookingsTable.orderCode, `%${q}%`),
      )
    )
    .orderBy(desc(bookingsTable.shootDate))
    .limit(20);

  res.json(rows.map(b => ({
    ...b,
    totalAmount:     parseFloat(String(b.totalAmount     || 0)),
    paidAmount:      parseFloat(String(b.paidAmount      || 0)),
    remainingAmount: parseFloat(String(b.remainingAmount || 0)),
  })));
});

// POST /payments — tạo phiếu thu mới
router.post("/payments", async (req, res) => {
  const {
    bookingId, rentalId, amount, paymentMethod, paymentType,
    collectorName, bankName, proofImageUrl, paidDate, notes, paidAt,
  } = req.body;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      bookingId:     bookingId     || null,
      rentalId:      rentalId      || null,
      amount:        String(amount),
      paymentMethod,
      paymentType:   paymentType   || "payment",
      collectorName: collectorName || null,
      bankName:      bankName      || null,
      proofImageUrl: proofImageUrl || null,
      paidDate:      paidDate      || null,
      notes:         notes         || null,
      ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
    })
    .returning();

  if (bookingId) {
    const allPaid = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, bookingId));
    const totalPaid = allPaid.reduce((s, p) => s + parseFloat(p.amount), 0);
    const [bk] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    const remaining = Math.max(0, parseFloat(String(bk?.totalAmount || 0)) - totalPaid);
    await db.update(bookingsTable)
      .set({ paidAmount: String(totalPaid), remainingAmount: String(remaining) })
      .where(eq(bookingsTable.id, bookingId));
  }

  res.status(201).json({ ...payment, amount: parseFloat(payment.amount) });
});

// DELETE /payments/:id
router.delete("/payments/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
  if (payment?.bookingId) {
    const remaining = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, payment.bookingId));
    const totalPaid = remaining.reduce((s, p) => s + parseFloat(p.amount), 0);
    const [bk] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, payment.bookingId));
    const rem = Math.max(0, parseFloat(String(bk?.totalAmount || 0)) - totalPaid);
    await db.update(bookingsTable)
      .set({ paidAmount: String(totalPaid), remainingAmount: String(rem) })
      .where(eq(bookingsTable.id, payment.bookingId));
  }
  res.status(204).send();
});

export default router;
