import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, staffTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const TASK_TYPE_LABELS: Record<string, string> = {
  chup: "Chụp ảnh", makeup: "Trang điểm", pts: "Chỉnh ảnh (PTS)",
  support: "Hỗ trợ", in: "In ảnh/album", giao_file: "Giao file ảnh",
  goi_khach: "Gọi / nhắn khách", quay_phim: "Quay phim", other: "Khác",
};

const fmt = (t: Record<string, unknown>, assigneeName: string | null) => ({
  ...t,
  assigneeName,
  taskTypeLabel: TASK_TYPE_LABELS[(t.taskType as string) ?? ""] ?? (t.taskType as string) ?? "",
});

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
  const { title, description, category, assigneeId, bookingId, servicePackageId, role, taskType, priority, dueDate, notes } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Thiếu tiêu đề" });

  const [task] = await db.insert(tasksTable).values({
    title, description,
    category: category || "other",
    assigneeId: assigneeId || null,
    bookingId: bookingId || null,
    servicePackageId: servicePackageId || null,
    role: role || null,
    taskType: taskType || null,
    priority: priority || "medium",
    dueDate: dueDate || null,
    notes: notes || null,
    status: "todo",
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
  const { title, description, assigneeId, priority, status, dueDate, notes, taskType, role, servicePackageId } = req.body;
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
