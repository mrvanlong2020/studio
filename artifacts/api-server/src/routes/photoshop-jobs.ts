import { Router } from "express";
import { db, pool } from "@workspace/db";
import { photoshopJobsTable, bookingsTable, bookingItemsTable } from "@workspace/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { verifyToken } from "./auth";

const router = Router();

// ── Helper: deactivate ALL extra_retouched items for a booking ───────────────
async function clearExtraRetouchedItem(bookingId: number) {
  await db
    .update(bookingItemsTable)
    .set({ qty: 0, totalPrice: "0", isActive: 0 })
    .where(and(eq(bookingItemsTable.bookingId, bookingId), eq(bookingItemsTable.type, "extra_retouched")));
}

// ── Helper: sync extra_retouched booking_item after job update ────────────────
// extra = max(0, donePhotos - includedSnapshot)
// Keeps canonical row (highest id), deactivates duplicates, inserts when none exists
async function syncExtraRetouchedItem(bookingId: number, donePhotos: number) {
  const [booking] = await db
    .select({ snap: bookingsTable.includedRetouchedPhotosSnapshot })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return;

  const included = booking.snap ?? 0;
  const extra = Math.max(0, donePhotos - included);

  // Fetch all existing extra_retouched items for this booking (sorted so canonical is first)
  const allExisting = await db
    .select()
    .from(bookingItemsTable)
    .where(and(eq(bookingItemsTable.bookingId, bookingId), eq(bookingItemsTable.type, "extra_retouched")));

  if (extra > 0) {
    // Use the first row as canonical; deactivate any duplicates
    const [canonical, ...duplicates] = allExisting;
    if (duplicates.length > 0) {
      for (const dup of duplicates) {
        await db.update(bookingItemsTable).set({ qty: 0, totalPrice: "0", isActive: 0 }).where(eq(bookingItemsTable.id, dup.id));
      }
    }
    if (canonical) {
      const unitPrice = parseFloat(String(canonical.unitPrice)) || 0;
      await db
        .update(bookingItemsTable)
        .set({ qty: extra, totalPrice: String(unitPrice * extra), isActive: 1 })
        .where(eq(bookingItemsTable.id, canonical.id));
    } else {
      await db.insert(bookingItemsTable).values({
        bookingId,
        type: "extra_retouched",
        title: "Ảnh hậu kỳ vượt gói",
        qty: extra,
        unitPrice: "0",
        totalPrice: "0",
        isActive: 1,
        notes: `Vượt ${included} ảnh bao gồm`,
      });
    }
  } else {
    // No extra — deactivate ALL existing items for this booking
    await clearExtraRetouchedItem(bookingId);
  }
}

// ── NEW: Booking-centric view (MUST be before /:id) ───────────────────────────
router.get("/photoshop-jobs/booking-view", async (req, res) => {
  try {
    const { search, status, staffId } = req.query as Record<string, string>;

    const result = await pool.query(`
      SELECT
        b.id              AS booking_id,
        b.order_code,
        b.shoot_date,
        b.created_at      AS booking_created_at,
        b.package_type,
        b.service_label,
        c.name            AS customer_name,
        c.phone           AS customer_phone,
        pj.id             AS job_id,
        pj.job_code,
        pj.status,
        pj.assigned_staff_id,
        pj.assigned_staff_name,
        pj.received_file_date,
        pj.internal_deadline,
        pj.customer_deadline,
        pj.total_photos,
        pj.done_photos,
        pj.progress_percent,
        pj.notes,
        pj.updated_at     AS job_updated_at
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      LEFT JOIN photoshop_jobs pj
        ON pj.booking_id = b.id AND pj.is_active = true
      WHERE b.status NOT IN ('cancelled')
        AND (b.parent_id IS NULL OR b.is_parent_contract = true)
      ORDER BY b.created_at DESC
    `);

    let data = result.rows as Record<string, unknown>[];

    if (status && status !== "all") {
      if (status === "chua_nhan") {
        data = data.filter(r => !r.job_id || !r.assigned_staff_id || r.status === "chua_nhan");
      } else {
        data = data.filter(r => r.status === status);
      }
    }

    if (staffId) {
      data = data.filter(r => String(r.assigned_staff_id) === staffId);
    }

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        String(r.customer_name ?? "").toLowerCase().includes(q) ||
        String(r.customer_phone ?? "").toLowerCase().includes(q) ||
        String(r.shoot_date ?? "").includes(q) ||
        String(r.order_code ?? "").toLowerCase().includes(q)
      );
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── NEW: My stats (MUST be before /:id) ───────────────────────────────────────
router.get("/photoshop-jobs/my-stats", async (req, res) => {
  try {
    const callerId = verifyToken(req.headers.authorization);
    if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

    const staffRow = await pool.query(`SELECT role FROM staff WHERE id = $1`, [callerId]);
    const isAdmin = staffRow.rows[0]?.role === "admin";

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Đơn đang làm (dang_xu_ly / cho_duyet)
    const myActiveQ = isAdmin
      ? await pool.query(`SELECT COUNT(*) FROM photoshop_jobs WHERE status IN ('dang_xu_ly','cho_duyet') AND is_active = true`)
      : await pool.query(`SELECT COUNT(*) FROM photoshop_jobs WHERE assigned_staff_id = $1 AND status IN ('dang_xu_ly','cho_duyet') AND is_active = true`, [callerId]);

    // Đơn hoàn thành tháng này
    const myDoneQ = isAdmin
      ? await pool.query(`SELECT COUNT(*) FROM photoshop_jobs WHERE status = 'hoan_thanh' AND updated_at >= $1 AND is_active = true`, [monthStart])
      : await pool.query(`SELECT COUNT(*) FROM photoshop_jobs WHERE assigned_staff_id = $1 AND status = 'hoan_thanh' AND updated_at >= $2 AND is_active = true`, [callerId, monthStart]);

    // Đơn chưa nhận: booking không có job active, hoặc job chưa assigned, hoặc status = chua_nhan
    const unassignedQ = await pool.query(`
      SELECT COUNT(*) FROM bookings b
      WHERE b.status NOT IN ('cancelled')
        AND (b.parent_id IS NULL OR b.is_parent_contract = true)
        AND NOT EXISTS (
          SELECT 1 FROM photoshop_jobs pj
          WHERE pj.booking_id = b.id
            AND pj.is_active = true
            AND pj.assigned_staff_id IS NOT NULL
            AND pj.status != 'chua_nhan'
        )
    `);

    res.json({
      myActive: parseInt(myActiveQ.rows[0]?.count ?? "0"),
      myDoneThisMonth: parseInt(myDoneQ.rows[0]?.count ?? "0"),
      unassigned: parseInt(unassignedQ.rows[0]?.count ?? "0"),
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Original list endpoint ────────────────────────────────────────────────────
router.get("/photoshop-jobs", async (req, res) => {
  try {
    const { search, status } = req.query as Record<string, string>;
    let rows = await db.select().from(photoshopJobsTable).orderBy(desc(photoshopJobsTable.createdAt));
    if (status) rows = rows.filter(r => r.status === status);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.jobCode.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.assignedStaffName ?? "").toLowerCase().includes(q)
      );
    }

    // Join includedRetouchedPhotosSnapshot from linked bookings
    const bookingIds = rows.map(r => r.bookingId).filter((id): id is number => id != null);
    let includedMap: Record<number, number> = {};
    let extraFeeMap: Record<number, { qty: number; unitPrice: number; totalPrice: number }> = {};

    if (bookingIds.length > 0) {
      const bRows = await db
        .select({ id: bookingsTable.id, snap: bookingsTable.includedRetouchedPhotosSnapshot })
        .from(bookingsTable)
        .where(inArray(bookingsTable.id, bookingIds));
      includedMap = Object.fromEntries(bRows.map(b => [b.id, b.snap ?? 0]));

      // Fetch extra_retouched booking items for these bookings
      const extraItems = await db
        .select()
        .from(bookingItemsTable)
        .where(and(inArray(bookingItemsTable.bookingId, bookingIds), eq(bookingItemsTable.type, "extra_retouched")));
      for (const item of extraItems) {
        extraFeeMap[item.bookingId] = {
          qty: item.qty,
          unitPrice: parseFloat(String(item.unitPrice)),
          totalPrice: parseFloat(String(item.totalPrice)),
        };
      }
    }

    const result = rows.map(r => {
      const included = r.bookingId != null ? (includedMap[r.bookingId] ?? null) : null;
      const extraCount = included != null
        ? Math.max(0, (r.donePhotos ?? 0) - included)
        : null;
      const extraFee = r.bookingId != null ? (extraFeeMap[r.bookingId] ?? null) : null;
      return {
        ...r,
        includedCount: included,
        extraCount,
        extraFeeUnitPrice: extraFee?.unitPrice ?? 0,
        extraFeeTotal: extraFee?.totalPrice ?? 0,
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Single job by id ──────────────────────────────────────────────────────────
router.get("/photoshop-jobs/:id", async (req, res) => {
  try {
    const rows = await db.select().from(photoshopJobsTable).where(eq(photoshopJobsTable.id, +req.params.id));
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Create job — bookingId REQUIRED ──────────────────────────────────────────
router.post("/photoshop-jobs", async (req, res) => {
  try {
    const {
      jobCode, bookingId, customerName, customerPhone, serviceName,
      assignedStaffId, assignedStaffName, shootDate, receivedFileDate,
      internalDeadline, customerDeadline, status, progressPercent,
      totalPhotos, donePhotos, notes
    } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "Phải gắn với đơn hàng. bookingId là bắt buộc." });
    }

    // Prevent duplicate active job for the same booking
    const existing = await db
      .select({ id: photoshopJobsTable.id })
      .from(photoshopJobsTable)
      .where(and(eq(photoshopJobsTable.bookingId, Number(bookingId)), eq(photoshopJobsTable.isActive, true)));
    if (existing.length > 0) {
      return res.status(400).json({ error: "Đơn hàng này đã có job hậu kỳ", jobId: existing[0].id });
    }

    const [row] = await db.insert(photoshopJobsTable).values({
      jobCode: jobCode || `JOB-${Date.now()}`,
      bookingId: Number(bookingId),
      customerName: customerName || "",
      customerPhone: customerPhone || "",
      serviceName: serviceName || "",
      assignedStaffId: assignedStaffId || null,
      assignedStaffName: assignedStaffName || "",
      shootDate: shootDate || "",
      receivedFileDate: receivedFileDate || "",
      internalDeadline: internalDeadline || "",
      customerDeadline: customerDeadline || "",
      status: status || "chua_nhan",
      progressPercent: progressPercent ?? 0,
      totalPhotos: totalPhotos ?? 0,
      donePhotos: donePhotos ?? 0,
      notes: notes || "",
    }).returning();

    if (row.bookingId && row.donePhotos > 0) {
      await syncExtraRetouchedItem(row.bookingId, row.donePhotos).catch(err =>
        console.error("[photoshop-jobs] syncExtraRetouchedItem (POST) failed:", err)
      );
    }

    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Update job ────────────────────────────────────────────────────────────────
router.put("/photoshop-jobs/:id", async (req, res) => {
  try {
    const {
      jobCode, bookingId, customerName, customerPhone, serviceName,
      assignedStaffId, assignedStaffName, shootDate, receivedFileDate,
      internalDeadline, customerDeadline, status, progressPercent,
      totalPhotos, donePhotos, notes, isActive
    } = req.body;

    const [oldJob] = await db
      .select({ bookingId: photoshopJobsTable.bookingId })
      .from(photoshopJobsTable)
      .where(eq(photoshopJobsTable.id, +req.params.id));
    const oldBookingId = oldJob?.bookingId ?? null;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (jobCode !== undefined) updates.jobCode = jobCode;
    if (bookingId !== undefined) updates.bookingId = bookingId;
    if (customerName !== undefined) updates.customerName = customerName;
    if (customerPhone !== undefined) updates.customerPhone = customerPhone;
    if (serviceName !== undefined) updates.serviceName = serviceName;
    if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId;
    if (assignedStaffName !== undefined) updates.assignedStaffName = assignedStaffName;
    if (shootDate !== undefined) updates.shootDate = shootDate;
    if (receivedFileDate !== undefined) updates.receivedFileDate = receivedFileDate;
    if (internalDeadline !== undefined) updates.internalDeadline = internalDeadline;
    if (customerDeadline !== undefined) updates.customerDeadline = customerDeadline;
    if (status !== undefined) updates.status = status;
    if (progressPercent !== undefined) updates.progressPercent = progressPercent;
    if (totalPhotos !== undefined) updates.totalPhotos = totalPhotos;
    if (donePhotos !== undefined) updates.donePhotos = donePhotos;
    if (notes !== undefined) updates.notes = notes;
    if (isActive !== undefined) updates.isActive = isActive;

    const [row] = await db
      .update(photoshopJobsTable)
      .set(updates as never)
      .where(eq(photoshopJobsTable.id, +req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    const newBookingId = row.bookingId ?? null;
    const bookingIdChanged = bookingId !== undefined && oldBookingId !== newBookingId;

    if (bookingIdChanged && oldBookingId != null) {
      await clearExtraRetouchedItem(oldBookingId).catch(err =>
        console.error("[photoshop-jobs] clearExtraRetouchedItem (old booking) failed:", err)
      );
    }

    if ((donePhotos !== undefined || bookingIdChanged) && newBookingId) {
      await syncExtraRetouchedItem(newBookingId, row.donePhotos ?? 0).catch(err =>
        console.error("[photoshop-jobs] syncExtraRetouchedItem (PUT) failed:", err)
      );
    }

    res.json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Delete job ────────────────────────────────────────────────────────────────
router.delete("/photoshop-jobs/:id", async (req, res) => {
  try {
    const [job] = await db
      .select({ bookingId: photoshopJobsTable.bookingId })
      .from(photoshopJobsTable)
      .where(eq(photoshopJobsTable.id, +req.params.id));
    if (job?.bookingId) {
      await clearExtraRetouchedItem(job.bookingId).catch(err =>
        console.error("[photoshop-jobs] clearExtraRetouchedItem (DELETE) failed:", err)
      );
    }
    await db.delete(photoshopJobsTable).where(eq(photoshopJobsTable.id, +req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
