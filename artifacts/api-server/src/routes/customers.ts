import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { customersTable, bookingsTable, paymentsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  const search = req.query.search as string | undefined;
  let customers;
  if (search) {
    const pct = `%${search}%`;
    const r = await pool.query(
      `SELECT * FROM customers
       WHERE unaccent(name) ILIKE unaccent($1)
          OR phone ILIKE $2
          OR facebook ILIKE $3
       ORDER BY created_at DESC`,
      [pct, pct, pct]
    );
    customers = r.rows.map((row: any) => ({
      id: row.id, name: row.name, phone: row.phone, email: row.email,
      address: row.address, notes: row.notes, facebook: row.facebook,
      zalo: row.zalo, source: row.source, tags: row.tags, gender: row.gender,
      avatar: row.avatar, customCode: row.custom_code, createdAt: row.created_at,
    }));
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
  if (!phone?.trim()) return res.status(400).json({ error: "Số điện thoại là bắt buộc" });
  try {
    const count = await db.select().from(customersTable);
    const customCode = `KH${String(count.length + 1).padStart(3, "0")}`;
    const [customer] = await db
      .insert(customersTable)
      .values({ name, phone: phone.trim(), email, address, notes, facebook, zalo, source: source || "other", tags: tags || [], gender, avatar, customCode })
      .returning();
    res.status(201).json({ ...customer, totalBookings: 0, totalPaid: 0, totalDebt: 0 });
  } catch (err: any) {
    if (err?.code === "23505" && err?.constraint?.includes("phone")) {
      return res.status(409).json({ error: `Số điện thoại "${phone}" đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.` });
    }
    throw err;
  }
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
  if (!phone?.trim()) return res.status(400).json({ error: "Số điện thoại là bắt buộc" });
  try {
    const [customer] = await db
      .update(customersTable)
      .set({ name, phone: phone.trim(), email, address, notes, facebook, zalo, source, tags: tags || [], gender, avatar })
      .where(eq(customersTable.id, id))
      .returning();
    if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng" });
    res.json({ ...customer, totalBookings: 0, totalPaid: 0, totalDebt: 0 });
  } catch (err: any) {
    if (err?.code === "23505" && err?.constraint?.includes("phone")) {
      return res.status(409).json({ error: `Số điện thoại "${phone}" đã được dùng bởi khách hàng khác. Vui lòng kiểm tra lại.` });
    }
    throw err;
  }
});

router.delete("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.status(204).send();
});

export default router;
