import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { paymentsTable, bookingsTable, customersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /payments — danh sách phiếu thu (lọc theo bookingId hoặc rentalId)
router.get("/payments", async (req, res) => {
  try {
  const bookingId = req.query.bookingId ? parseInt(req.query.bookingId as string) : undefined;
  const rentalId  = req.query.rentalId  ? parseInt(req.query.rentalId  as string) : undefined;

  let query = db.select().from(paymentsTable).$dynamic();
  if (bookingId) query = query.where(eq(paymentsTable.bookingId, bookingId));
  else if (rentalId) query = query.where(eq(paymentsTable.rentalId, rentalId));

  const payments = await query.orderBy(desc(paymentsTable.paidAt));
  res.json(payments.map(p => ({ ...p, amount: parseFloat(p.amount) })));
  } catch (err) {
    console.error("GET /payments error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

function fmtBookingRow(row: any) {
  const totalAmount    = parseFloat(row.totalAmount    || 0);
  const discountAmount = parseFloat(row.discountAmount || 0);
  const paidAmount     = parseFloat(row.paidAmount     || 0);
  const remainingAmount = parseFloat(row.remainingAmount || 0);
  return {
    id:              Number(row.id),
    orderCode:       row.orderCode ?? null,
    customerId:      Number(row.customerId),
    customerName:    row.customerName ?? "",
    customerPhone:   row.customerPhone ?? "",
    customerCode:    row.customerCode ?? null,
    packageType:     row.packageType ?? "",
    totalAmount,
    discountAmount,
    paidAmount,
    remainingAmount,
    status:          row.status ?? "",
    shootDate:       row.shootDate ?? null,
    createdAt:       row.createdAt ?? null,
    notes:           row.notes ?? null,
    latestPaymentAt: row.latestPaymentAt ?? null,
    isParentContract: Boolean(row.isParentContract),
    serviceCount:    Number(row.serviceCount ?? 0),
  };
}

// Base SQL for booking rows — chỉ lấy hồ sơ tài chính thực sự:
// - Booking đơn lẻ (parent_id IS NULL AND is_parent_contract = false)
// - Booking cha đa dịch vụ (is_parent_contract = true)
// → KHÔNG lấy booking con (parent_id IS NOT NULL) vì chúng chỉ là lịch chụp
const BOOKING_JOIN_SQL = `
  SELECT
    b.id,
    b.order_code                  AS "orderCode",
    b.customer_id                 AS "customerId",
    c.name                        AS "customerName",
    c.phone                       AS "customerPhone",
    c.custom_code                 AS "customerCode",
    b.package_type                AS "packageType",
    b.total_amount::numeric       AS "totalAmount",
    b.discount_amount::numeric    AS "discountAmount",
    b.paid_amount::numeric        AS "paidAmount",
    GREATEST(0, (b.total_amount - COALESCE(b.discount_amount, 0) - b.paid_amount)::numeric) AS "remainingAmount",
    b.status,
    b.shoot_date                  AS "shootDate",
    b.created_at                  AS "createdAt",
    b.notes,
    b.is_parent_contract          AS "isParentContract",
    (SELECT COUNT(*) FROM bookings ch WHERE ch.parent_id = b.id) AS "serviceCount"
  FROM bookings b
  LEFT JOIN customers c ON b.customer_id = c.id
  WHERE b.parent_id IS NULL
`;

// GET /payments/suggestions — gợi ý thông minh khi mở ô tìm kiếm (chưa nhập)
router.get("/payments/suggestions", async (req, res) => {
  try {
  const [bookingsResult, paymentsResult] = await Promise.all([
    pool.query(`${BOOKING_JOIN_SQL}
      AND b.status NOT IN ('cancelled')
      ORDER BY b.created_at DESC
      LIMIT 200`),
    pool.query(`
      SELECT booking_id, MAX(paid_at) AS latest_paid_at
      FROM payments
      WHERE booking_id IS NOT NULL
      GROUP BY booking_id`),
  ]);

  const latestMap = new Map<number, string>();
  for (const row of paymentsResult.rows) {
    if (row.booking_id) latestMap.set(Number(row.booking_id), String(row.latest_paid_at));
  }

  const items = bookingsResult.rows.map((b: any) => ({
    ...fmtBookingRow(b),
    latestPaymentAt: latestMap.get(Number(b.id)) ?? null,
  }));

  const sorted = items.sort((a: any, b: any) => {
    const aOwed = a.remainingAmount > 0 ? 1 : 0;
    const bOwed = b.remainingAmount > 0 ? 1 : 0;
    if (bOwed !== aOwed) return bOwed - aOwed;
    const aTime = String(a.latestPaymentAt ?? a.createdAt ?? "");
    const bTime = String(b.latestPaymentAt ?? b.createdAt ?? "");
    return bTime > aTime ? 1 : -1;
  });

  res.json(sorted);
  } catch (err) {
    console.error("GET /payments/suggestions error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

// GET /payments/recent?period=today|7days|month&limit=10 — lịch sử thu gần đây
router.get("/payments/recent", async (req, res) => {
  try {
  const period = (req.query.period as string) || "today";
  const limit  = Math.min(parseInt((req.query.limit as string) || "10"), 100);

  let dateFilter: string;
  if (period === "today") {
    dateFilter = `p.paid_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  } else if (period === "7days") {
    dateFilter = `p.paid_at >= NOW() - INTERVAL '7 days'`;
  } else {
    // month
    dateFilter = `p.paid_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  }

  const BASE_SELECT = `
    SELECT
      p.id,
      p.booking_id         AS "bookingId",
      p.rental_id          AS "rentalId",
      p.amount::numeric    AS "amount",
      p.payment_method     AS "paymentMethod",
      p.payment_type       AS "paymentType",
      p.collector_name     AS "collectorName",
      p.bank_name          AS "bankName",
      p.proof_image_url    AS "proofImageUrl",
      p.paid_date          AS "paidDate",
      p.paid_at            AS "paidAt",
      p.notes,
      c.name               AS "customerName",
      c.phone              AS "customerPhone",
      b.order_code         AS "orderCode",
      b.package_type       AS "packageType",
      b.total_amount::numeric       AS "totalAmount",
      b.discount_amount::numeric    AS "discountAmount",
      b.paid_amount::numeric        AS "paidAmount",
      GREATEST(0, (b.total_amount - COALESCE(b.discount_amount, 0) - b.paid_amount)::numeric) AS "remainingAmount",
      b.status             AS "status",
      b.is_parent_contract AS "isParentContract",
      (SELECT COUNT(*) FROM payments pp WHERE pp.booking_id = b.id) AS "paymentCount"
    FROM payments p
    LEFT JOIN bookings b ON p.booking_id = b.id
    LEFT JOIN customers c ON b.customer_id = c.id
    WHERE p.payment_type IN ('payment', 'deposit')
      AND ${dateFilter}
    ORDER BY p.paid_at DESC
    LIMIT $1`;

  const [listResult, sumResult] = await Promise.all([
    pool.query(BASE_SELECT, [limit]),
    pool.query(
      `SELECT
         COUNT(*)::int          AS "count",
         COALESCE(SUM(p.amount::numeric), 0) AS "total"
       FROM payments p
       WHERE p.payment_type IN ('payment', 'deposit')
         AND ${dateFilter}`
    ),
  ]);

  const payments = listResult.rows.map((p: any) => ({
    id:           Number(p.id),
    bookingId:    p.bookingId ? Number(p.bookingId) : null,
    rentalId:     p.rentalId  ? Number(p.rentalId)  : null,
    amount:       parseFloat(p.amount),
    paymentMethod: p.paymentMethod,
    paymentType:  p.paymentType,
    collectorName: p.collectorName ?? null,
    bankName:     p.bankName ?? null,
    proofImageUrl: p.proofImageUrl ?? null,
    paidDate:     p.paidDate ?? null,
    paidAt:       p.paidAt ?? null,
    notes:        p.notes ?? null,
    customerName: p.customerName ?? null,
    customerPhone: p.customerPhone ?? null,
    orderCode:    p.orderCode ?? null,
    packageType:  p.packageType ?? null,
    totalAmount:     parseFloat(p.totalAmount    || 0),
    discountAmount:  parseFloat(p.discountAmount || 0),
    paidAmount:      parseFloat(p.paidAmount     || 0),
    remainingAmount: parseFloat(p.remainingAmount || 0),
    status:          p.status ?? null,
    isParentContract: Boolean(p.isParentContract),
    paymentCount: Number(p.paymentCount ?? 0),
  }));

  const summary = sumResult.rows[0];
  res.json({
    payments,
    summary: {
      count: Number(summary.count),
      total: parseFloat(summary.total),
    },
  });
  } catch (err) {
    console.error("GET /payments/recent error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

// GET /payments/search?q=... — tìm đơn hàng cần thu theo tên/SĐT/mã đơn
// Hỗ trợ tìm kiếm có dấu/không dấu nhờ unaccent()
router.get("/payments/search", async (req, res) => {
  try {
  const q = ((req.query.q as string) || "").trim();
  if (!q) { res.json([]); return; }

  const pct = `%${q}%`;
  const result = await pool.query(
    `${BOOKING_JOIN_SQL}
     AND (
       unaccent(c.name) ILIKE unaccent($1)
       OR c.phone ILIKE $2
       OR b.order_code ILIKE $3
     )
     AND b.status != 'cancelled'
     ORDER BY b.created_at DESC
     LIMIT 20`,
    [pct, pct, pct]
  );

  res.json(result.rows.map(fmtBookingRow));
  } catch (err) {
    console.error("GET /payments/search error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

// POST /payments — tạo phiếu thu mới
router.post("/payments", async (req, res) => {
  try {
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
    const bkTotal    = parseFloat(String(bk?.totalAmount    || 0));
    const bkDiscount = parseFloat(String(bk?.discountAmount || 0));
    const remaining  = Math.max(0, bkTotal - bkDiscount - totalPaid);
    await db.update(bookingsTable)
      .set({ paidAmount: String(totalPaid), remainingAmount: String(remaining) })
      .where(eq(bookingsTable.id, bookingId));
  }

  res.status(201).json({ ...payment, amount: parseFloat(payment.amount) });
  } catch (err) {
    console.error("POST /payments error:", err);
    res.status(500).json({ error: "Lỗi hệ thống khi tạo phiếu thu" });
  }
});

// POST /payments/sync-deposits — đồng bộ tiền cọc cũ thành phiếu thu
// - Xóa duplicate deposit records (giữ bản cũ nhất)
// - Tạo deposit record cho booking nào có depositAmount > 0 nhưng chưa có phiếu thu nào
// - Cập nhật lại paid_amount trên bookings table
router.post("/payments/sync-deposits", async (_req, res) => {
  try {
  const report: { created: number; removed: number; recalculated: number } = {
    created: 0, removed: 0, recalculated: 0,
  };

  // Lấy tất cả bookings có depositAmount > 0, không phải child booking
  const bookingsWithDeposit = await pool.query(`
    SELECT id, deposit_amount::numeric AS deposit_amount, total_amount::numeric AS total_amount,
           order_code, shoot_date, status
    FROM bookings
    WHERE deposit_amount::numeric > 0
      AND parent_id IS NULL
    ORDER BY id
  `);

  const affectedBookingIds: number[] = [];

  for (const bk of bookingsWithDeposit.rows) {
    const bkId       = Number(bk.id);
    const depAmount  = parseFloat(bk.deposit_amount);

    // Lấy tất cả deposit payments cho booking này, sắp xếp theo thời gian
    const depPayments = await pool.query(`
      SELECT id FROM payments
      WHERE booking_id = $1 AND payment_type = 'deposit'
      ORDER BY paid_at ASC
    `, [bkId]);

    if (depPayments.rows.length === 0) {
      // Không có deposit record → tạo mới
      await pool.query(`
        INSERT INTO payments (booking_id, amount, payment_method, payment_type, paid_date, notes, paid_at)
        VALUES ($1, $2, 'cash', 'deposit', $3, 'Cọc giữ lịch', NOW())
      `, [bkId, String(depAmount), bk.shoot_date || null]);
      report.created++;
      affectedBookingIds.push(bkId);
    } else if (depPayments.rows.length > 1) {
      // Có nhiều hơn 1 deposit → giữ cái đầu tiên, xóa phần thừa
      const toDelete = depPayments.rows.slice(1).map((r: any) => Number(r.id));
      for (const did of toDelete) {
        await pool.query(`DELETE FROM payments WHERE id = $1`, [did]);
        report.removed++;
      }
      affectedBookingIds.push(bkId);
    }
  }

  // Tính lại paid_amount và remaining_amount cho tất cả booking bị ảnh hưởng
  const uniqueIds = [...new Set(affectedBookingIds)];
  for (const bkId of uniqueIds) {
    const [paidResult, bkResult] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount::numeric), 0) AS total_paid FROM payments WHERE booking_id = $1`, [bkId]),
      pool.query(`SELECT total_amount::numeric AS total_amount, COALESCE(discount_amount::numeric, 0) AS discount_amount FROM bookings WHERE id = $1`, [bkId]),
    ]);
    const totalPaid      = parseFloat(paidResult.rows[0]?.total_paid    || 0);
    const totalAmount    = parseFloat(bkResult.rows[0]?.total_amount    || 0);
    const discountAmount = parseFloat(bkResult.rows[0]?.discount_amount || 0);
    const remaining      = Math.max(0, totalAmount - discountAmount - totalPaid);
    await pool.query(`
      UPDATE bookings SET paid_amount = $1, remaining_amount = $2 WHERE id = $3
    `, [String(totalPaid), String(remaining), bkId]);
    report.recalculated++;
  }

  res.json({
    message: `Đồng bộ hoàn tất: tạo ${report.created} phiếu cọc mới, xóa ${report.removed} bản trùng, cập nhật ${report.recalculated} đơn hàng`,
    ...report,
  });
  } catch (err) {
    console.error("POST /payments/sync-deposits error:", err);
    res.status(500).json({ error: "Lỗi hệ thống khi đồng bộ cọc" });
  }
});

// DELETE /payments/:id
router.delete("/payments/:id", async (req, res) => {
  try {
  const id = parseInt(req.params.id);
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
  if (payment?.bookingId) {
    const remaining = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, payment.bookingId));
    const totalPaid = remaining.reduce((s, p) => s + parseFloat(p.amount), 0);
    const [bk] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, payment.bookingId));
    const bkTotal    = parseFloat(String(bk?.totalAmount    || 0));
    const bkDiscount = parseFloat(String(bk?.discountAmount || 0));
    const rem = Math.max(0, bkTotal - bkDiscount - totalPaid);
    await db.update(bookingsTable)
      .set({ paidAmount: String(totalPaid), remainingAmount: String(rem) })
      .where(eq(bookingsTable.id, payment.bookingId));
  }
  res.status(204).send();
  } catch (err) {
    console.error("DELETE /payments/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống khi xóa phiếu thu" });
  }
});

export default router;
