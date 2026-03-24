import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customersTable, bookingsTable, paymentsTable } from "@workspace/db/schema";
import { eq, ilike, or, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  const search = req.query.search as string | undefined;
  let customers;
  if (search) {
    customers = await db
      .select()
      .from(customersTable)
      .where(or(
        ilike(customersTable.name, `%${search}%`),
        ilike(customersTable.phone, `%${search}%`),
        ilike(customersTable.facebook, `%${search}%`)
      ))
      .orderBy(desc(customersTable.createdAt));
  } else {
    customers = await db.select().from(customersTable).orderBy(desc(customersTable.createdAt));
  }

  const allPayments = await db.select().from(paymentsTable);

  const result = await Promise.all(
    customers.map(async (c) => {
      const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.customerId, c.id));
      const bookingIds = bookings.map((b) => b.id);
      const totalPaid = allPayments
        .filter((p) => p.bookingId && bookingIds.includes(p.bookingId))
        .reduce((s, p) => s + parseFloat(p.amount), 0);
      const totalOwed = bookings.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
      const totalDebt = Math.max(0, totalOwed - totalPaid);
      return { ...c, totalBookings: bookings.length, totalPaid, totalDebt };
    })
  );

  res.json(result);
});

router.post("/customers", async (req, res) => {
  const { name, phone, email, address, notes, facebook, zalo, source, tags, gender, avatar } = req.body;
  const count = await db.select().from(customersTable);
  const customCode = `KH${String(count.length + 1).padStart(3, "0")}`;
  const [customer] = await db
    .insert(customersTable)
    .values({ name, phone, email, address, notes, facebook, zalo, source: source || "other", tags: tags || [], gender, avatar, customCode })
    .returning();
  res.status(201).json({ ...customer, totalBookings: 0, totalPaid: 0, totalDebt: 0 });
});

router.get("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng" });
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.customerId, id));
  const allPayments = await db.select().from(paymentsTable);
  const bookingIds = bookings.map((b) => b.id);
  const totalPaid = allPayments.filter(p => p.bookingId && bookingIds.includes(p.bookingId)).reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalOwed = bookings.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
  const totalDebt = Math.max(0, totalOwed - totalPaid);
  res.json({ ...customer, totalBookings: bookings.length, totalPaid, totalDebt, bookings });
});

router.put("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, email, address, notes, facebook, zalo, source, tags, gender, avatar } = req.body;
  const [customer] = await db
    .update(customersTable)
    .set({ name, phone, email, address, notes, facebook, zalo, source, tags: tags || [], gender, avatar })
    .where(eq(customersTable.id, id))
    .returning();
  if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng" });
  res.json({ ...customer, totalBookings: 0, totalPaid: 0, totalDebt: 0 });
});

router.delete("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.status(204).send();
});

export default router;
