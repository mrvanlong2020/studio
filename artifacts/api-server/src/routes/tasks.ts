import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, staffTable, staffRatePricesTable, bookingsTable } from "@workspace/db/schema";
import { eq, desc, and, or } from "drizzle-orm";

const router: IRouter = Router();

const TASK_TYPE_LABELS: Record<string, string> = {
  chup: "Chụp ảnh", makeup: "Trang điểm", pts: "Chỉnh ảnh (PTS)",
  support: "Hỗ trợ", in: "In ảnh/album", giao_file: "Giao file ảnh",
  goi_khach: "Gọi / nhắn khách", quay_phim: "Quay phim", other: "Khác",
};

const fmt = (t: Record<string, unknown>, assigneeName: string | null) => ({
  ...t,
  cost: t.cost != null ? parseFloat(t.cost as string) : 0,
  assigneeName,
  taskTypeLabel: TASK_TYPE_LABELS[(t.taskType as string) ?? ""] ?? (t.taskType as string) ?? "",
});

// ── Helper: tự tính cost từ staffRatePricesTable ──────────────────────────────
async function lookupCost(staffId: number | null, role: string | null, taskType: string | null, bookingTotalAmount: number): Promise<number> {
  if (!staffId || !role) return 0;
  const taskKey = taskType || "mac_dinh";

  // Exact match: staffId + role + taskKey
  const rows = await db.select()
    .from(staffRatePricesTable)
    .where(and(
      eq(staffRatePricesTable.staffId, staffId),
      eq(staffRatePricesTable.role, role),
      or(
        eq(staffRatePricesTable.taskKey, taskKey),
        eq(staffRatePricesTable.taskKey, "mac_dinh"),
      ),
    ));

  // Prefer exact taskKey match, fallback to mac_dinh
  const exact = rows.find(r => r.taskKey === taskKey);
  const fallback = rows.find(r => r.taskKey === "mac_dinh");
  const matched = exact ?? fallback;

  if (!matched || matched.rate == null) return 0;

  const rate = parseFloat(matched.rate);
  if (matched.rateType === "percent") {
    return Math.round(rate / 100 * bookingTotalAmount);
  }
  return rate;
}

// GET /tasks
router.get("/tasks", async (req, res) => {
  const statusFilter = req.query.status as string | undefined;
  const assigneeId = req.query.assigneeId ? parseInt(req.query.assigneeId as string) : undefined;
  const bookingId = req.query.bookingId ? parseInt(req.query.bookingId as string) : undefined;

  const rows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      category: tasksTable.category,
      assigneeId: tasksTable.assigneeId,
      assigneeName: staffTable.name,
      bookingId: tasksTable.bookingId,
      servicePackageId: tasksTable.servicePackageId,
      role: tasksTable.role,
      taskType: tasksTable.taskType,
      priority: tasksTable.priority,
      status: tasksTable.status,
      dueDate: tasksTable.dueDate,
      completedAt: tasksTable.completedAt,
      notes: tasksTable.notes,
      cost: tasksTable.cost,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .leftJoin(staffTable, eq(tasksTable.assigneeId, staffTable.id))
    .orderBy(desc(tasksTable.createdAt));

  let filtered = rows;
  if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
  if (assigneeId) filtered = filtered.filter(t => t.assigneeId === assigneeId);
  if (bookingId) filtered = filtered.filter(t => t.bookingId === bookingId);

  res.json(filtered.map(t => fmt(t as Record<string, unknown>, t.assigneeName ?? null)));
});

// POST /tasks
router.post("/tasks", async (req, res) => {
  const { title, description, category, assigneeId, bookingId, servicePackageId, role, taskType, priority, dueDate, notes, cost: costOverride } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Thiếu tiêu đề" });

  // Task #22: bookingId bắt buộc
  if (!bookingId) return res.status(400).json({ error: "Thiếu bookingId — mỗi việc phải thuộc 1 đơn hàng" });

  // Lookup booking total for percent-rate calc
  let bookingTotal = 0;
  const [booking] = await db.select({ totalAmount: bookingsTable.totalAmount }).from(bookingsTable).where(eq(bookingsTable.id, parseInt(String(bookingId))));
  if (booking) bookingTotal = parseFloat(booking.totalAmount);

  // Auto-compute cost from staffRates unless manually overridden
  let cost = 0;
  if (costOverride != null && costOverride !== "") {
    cost = parseFloat(String(costOverride));
  } else {
    cost = await lookupCost(assigneeId ? parseInt(String(assigneeId)) : null, role ?? null, taskType ?? null, bookingTotal);
  }

  const [task] = await db.insert(tasksTable).values({
    title, description,
    category: category || "other",
    assigneeId: assigneeId || null,
    bookingId: parseInt(String(bookingId)),
    servicePackageId: servicePackageId || null,
    role: role || null,
    taskType: taskType || null,
    priority: priority || "medium",
    dueDate: dueDate || null,
    notes: notes || null,
    status: "todo",
    cost: String(cost),
  }).returning();

  let assigneeName: string | null = null;
  if (task.assigneeId) {
    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, task.assigneeId));
    assigneeName = staff?.name ?? null;
  }

  res.status(201).json(fmt(task as unknown as Record<string, unknown>, assigneeName));
});

// PUT /tasks/:id
router.put("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, description, assigneeId, priority, status, dueDate, notes, taskType, role, servicePackageId, cost: costOverride } = req.body;
  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (assigneeId !== undefined) update.assigneeId = assigneeId;
  if (priority !== undefined) update.priority = priority;
  if (status !== undefined) {
    update.status = status;
    if (status === "done") update.completedAt = new Date();
    else update.completedAt = null;
  }
  if (dueDate !== undefined) update.dueDate = dueDate;
  if (notes !== undefined) update.notes = notes;
  if (taskType !== undefined) update.taskType = taskType;
  if (role !== undefined) update.role = role;
  if (servicePackageId !== undefined) update.servicePackageId = servicePackageId;

  // Re-lookup cost if staffId/role/taskType changed and no manual override
  if (costOverride != null && costOverride !== "") {
    update.cost = String(parseFloat(String(costOverride)));
  } else if (assigneeId !== undefined || role !== undefined || taskType !== undefined) {
    // Fetch current task to get the full context for cost lookup
    const [current] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (current) {
      const effectiveStaffId = assigneeId !== undefined ? (assigneeId || null) : current.assigneeId;
      const effectiveRole = role !== undefined ? (role || null) : current.role;
      const effectiveTaskType = taskType !== undefined ? (taskType || null) : current.taskType;

      let bookingTotal = 0;
      if (current.bookingId) {
        const [booking] = await db.select({ totalAmount: bookingsTable.totalAmount }).from(bookingsTable).where(eq(bookingsTable.id, current.bookingId));
        if (booking) bookingTotal = parseFloat(booking.totalAmount);
      }
      const recomputedCost = await lookupCost(effectiveStaffId, effectiveRole, effectiveTaskType, bookingTotal);
      update.cost = String(recomputedCost);
    }
  }

  const [task] = await db.update(tasksTable).set(update).where(eq(tasksTable.id, id)).returning();
  if (!task) return res.status(404).json({ error: "Task không tồn tại" });

  let assigneeName: string | null = null;
  if (task.assigneeId) {
    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, task.assigneeId));
    assigneeName = staff?.name ?? null;
  }

  res.json(fmt(task as unknown as Record<string, unknown>, assigneeName));
});

// DELETE /tasks/:id
router.delete("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.status(204).send();
});

export default router;
