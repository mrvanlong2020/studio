import { Router } from "express";
import { db } from "@workspace/db";
import { photoshopJobsTable } from "@workspace/db/schema";
import { eq, desc, ilike, or } from "drizzle-orm";

const router = Router();

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
    res.json(rows);
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
