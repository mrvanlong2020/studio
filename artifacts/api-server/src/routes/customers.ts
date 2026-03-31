import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { customersTable, bookingsTable, paymentsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

interface PgConstraintError {
  code: string;
  constraint?: string;
}

function isPgConstraintError(err: unknown): err is PgConstraintError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+\.]/g, "");
}

async function ensureCustomerPhoneUnique() {
  await pool.query(`
    ALTER TABLE customers
    ADD CONSTRAINT customers_phone_unique UNIQUE (phone)
  `).catch((err: unknown) => {
    if (isPgConstraintError(err) && (err.code === "42710" || err.code === "42P07")) return;
    throw err;
  });
}
ensureCustomerPhoneUnique().catch(console.error);

router.get("/customers", async (req, res) => {
  try {
  const search = req.query.search as string | undefined;
  let customers;
  if (search) {
    const pct = `%${search}%`;
    const normPct = `%${normalizePhone(search)}%`;
    const r = await pool.query(
      `SELECT * FROM customers
       WHERE unaccent(name) ILIKE unaccent($1)
          OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') ILIKE $2
          OR facebook ILIKE $3
       ORDER BY created_at DESC`,
      [pct, normPct, pct]
    );
    customers = r.rows.map((row: Record<string, unknown>) => ({
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
      const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.customerId, c.id as number));
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
  } catch (err) {
    console.error("GET /customers error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.get("/customers/by-phone", async (req, res) => {
  try {
  const rawPhone = (req.query.phone as string | undefined) ?? "";
  const phone = normalizePhone(rawPhone.trim());
  if (!phone) return res.status(400).json({ error: "Thiếu số điện thoại" });
  const r = await pool.query(
    `SELECT * FROM customers
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') = $1
     LIMIT 1`,
    [phone]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "Không tìm thấy" });
  const row = r.rows[0] as Record<string, unknown>;
  res.json({
    id: row.id, name: row.name, phone: row.phone, email: row.email,
    address: row.address, notes: row.notes, facebook: row.facebook,
    zalo: row.zalo, source: row.source, tags: row.tags, gender: row.gender,
    avatar: row.avatar, customCode: row.custom_code, createdAt: row.created_at,
  });
  } catch (err) {
    console.error("GET /customers/by-phone error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.post("/customers", async (req, res) => {
  const { name, phone, email, address, notes, facebook, zalo, source, tags, gender, avatar } = req.body;
  const normalizedPhone = phone ? normalizePhone(String(phone).trim()) : null;
  try {
    const count = await db.select().from(customersTable);
    const customCode = `KH${String(count.length + 1).padStart(3, "0")}`;
    const [customer] = await db
      .insert(customersTable)
      .values({ name, phone: normalizedPhone, email, address, notes, facebook, zalo, source: source || "other", tags: tags || [], gender, avatar, customCode })
      .returning();
    res.status(201).json({ ...customer, totalBookings: 0, totalPaid: 0, totalDebt: 0 });
  } catch (err: unknown) {
    if (isPgConstraintError(err) && err.code === "23505" && err.constraint?.includes("phone")) {
      const [existing] = await db.select().from(customersTable).where(eq(customersTable.phone, normalizedPhone));
      return res.status(409).json({
        conflict: true,
        existingCustomer: existing ?? null,
        error: `Số điện thoại "${phone}" đã tồn tại trong hệ thống.`,
      });
    }
    console.error("POST /customers error:", err);
    return res.status(500).json({ error: "Lỗi hệ thống khi tạo khách hàng" });
  }
});

router.get("/customers/:id", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("GET /customers/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.put("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, email, address, notes, facebook, zalo, source, tags, gender, avatar } = req.body;
  const rawPhone = phone !== undefined ? String(phone) : undefined;
  try {
    const setFields: Record<string, unknown> = {
      name, email, address, notes, facebook, zalo, source, tags: tags || [], gender, avatar,
    };
    if (rawPhone !== undefined) {
      const normalized = normalizePhone(rawPhone.trim());
      setFields.phone = normalized || null;
    }
    const [customer] = await db
      .update(customersTable)
      .set(setFields)
      .where(eq(customersTable.id, id))
      .returning();
    if (!customer) return res.status(404).json({ error: "Không tìm thấy khách hàng" });
    res.json({ ...customer, totalBookings: 0, totalPaid: 0, totalDebt: 0 });
  } catch (err: unknown) {
    if (isPgConstraintError(err) && err.code === "23505" && err.constraint?.includes("phone")) {
      return res.status(409).json({ error: `Số điện thoại "${phone}" đã được dùng bởi khách hàng khác. Vui lòng kiểm tra lại.` });
    }
    console.error("PUT /customers/:id error:", err);
    return res.status(500).json({ error: "Lỗi hệ thống khi cập nhật khách hàng" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
  const id = parseInt(req.params.id);
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.status(204).send();
  } catch (err: unknown) {
    // Drizzle wraps PG errors in .cause; check for FK constraint (code 23503)
    const pgError = (err as Record<string, unknown>)?.cause;
    if (isPgConstraintError(pgError) && pgError.code === "23503") {
      return res.status(409).json({
        error: "Không thể xóa khách hàng vì có đơn chụp hoặc thanh toán liên kết. Vui lòng xóa hoặc chuyển các đơn trước.",
      });
    }
    console.error("DELETE /customers/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

export default router;
