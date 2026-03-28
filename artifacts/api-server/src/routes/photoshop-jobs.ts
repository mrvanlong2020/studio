import { Router } from "express";
import { db } from "@workspace/db";
import { photoshopJobsTable, bookingsTable, bookingItemsTable } from "@workspace/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";

const router = Router();

// ── Helper: sync extra_retouched booking_item after job update ────────────────
async function syncExtraRetouchedItem(bookingId: number, donePhotos: number) {
  const [booking] = await db
    .select({ snap: bookingsTable.includedRetouchedPhotosSnapshot })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return;

  const included = booking.snap ?? 0;
  const extra = Math.max(0, donePhotos - included);

  // Find existing extra_retouched item for this booking
  const [existing] = await db
    .select()
    .from(bookingItemsTable)
    .where(and(eq(bookingItemsTable.bookingId, bookingId), eq(bookingItemsTable.type, "extra_retouched")));

  if (extra > 0) {
    const unitPrice = existing ? parseFloat(String(existing.unitPrice)) : 0;
    const totalPrice = unitPrice * extra;
    if (existing) {
      await db
        .update(bookingItemsTable)
        .set({ qty: extra, totalPrice: String(totalPrice), isActive: 1 })
        .where(eq(bookingItemsTable.id, existing.id));
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
    // No extra — deactivate any existing item
    if (existing) {
      await db
        .update(bookingItemsTable)
        .set({ qty: 0, totalPrice: "0", isActive: 0 })
        .where(eq(bookingItemsTable.id, existing.id));
    }
  }
}

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
      const extraCount = included != null ? Math.max(0, (r.donePhotos ?? 0) - included) : null;
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

router.get("/photoshop-jobs/:id", async (req, res) => {
  try {
    const rows = await db.select().from(photoshopJobsTable).where(eq(photoshopJobsTable.id, +req.params.id));
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/photoshop-jobs", async (req, res) => {
  try {
    const {
      jobCode, bookingId, customerName, customerPhone, serviceName,
      assignedStaffId, assignedStaffName, shootDate, receivedFileDate,
      internalDeadline, customerDeadline, status, progressPercent,
      totalPhotos, donePhotos, notes
    } = req.body;
    const [row] = await db.insert(photoshopJobsTable).values({
      jobCode: jobCode || `JOB-${Date.now()}`,
      bookingId: bookingId || null,
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

    // Sync extra_retouched item if linked to a booking
    if (row.bookingId && row.donePhotos > 0) {
      await syncExtraRetouchedItem(row.bookingId, row.donePhotos).catch(() => {});
    }

    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put("/photoshop-jobs/:id", async (req, res) => {
  try {
    const {
      jobCode, bookingId, customerName, customerPhone, serviceName,
      assignedStaffId, assignedStaffName, shootDate, receivedFileDate,
      internalDeadline, customerDeadline, status, progressPercent,
      totalPhotos, donePhotos, notes, isActive
    } = req.body;
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
    const [row] = await db.update(photoshopJobsTable).set(updates as never).where(eq(photoshopJobsTable.id, +req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    // Sync extra_retouched booking_item when donePhotos changes and job is linked to a booking
    if (donePhotos !== undefined && row.bookingId) {
      await syncExtraRetouchedItem(row.bookingId, row.donePhotos ?? 0).catch(() => {});
    }

    res.json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete("/photoshop-jobs/:id", async (req, res) => {
  try {
    await db.delete(photoshopJobsTable).where(eq(photoshopJobsTable.id, +req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
