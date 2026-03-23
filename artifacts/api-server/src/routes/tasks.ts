import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, staffTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/tasks", async (req, res) => {
  const status = req.query.status as string | undefined;
  const assigneeId = req.query.assigneeId ? parseInt(req.query.assigneeId as string) : undefined;

  const rows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      assigneeId: tasksTable.assigneeId,
      assigneeName: staffTable.name,
      bookingId: tasksTable.bookingId,
      priority: tasksTable.priority,
      status: tasksTable.status,
      dueDate: tasksTable.dueDate,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .leftJoin(staffTable, eq(tasksTable.assigneeId, staffTable.id))
    .orderBy(tasksTable.createdAt);

  let filtered = rows;
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (assigneeId) filtered = filtered.filter((t) => t.assigneeId === assigneeId);

  res.json(filtered);
});

router.post("/tasks", async (req, res) => {
  const { title, description, assigneeId, bookingId, priority, dueDate } = req.body;
  const [task] = await db
    .insert(tasksTable)
    .values({ title, description, assigneeId, bookingId, priority, dueDate, status: "todo" })
    .returning();

  let assigneeName = null;
  if (task.assigneeId) {
    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, task.assigneeId));
    assigneeName = staff?.name ?? null;
  }

  res.status(201).json({ ...task, assigneeName });
});

router.put("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, description, assigneeId, priority, status, dueDate } = req.body;
  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (assigneeId !== undefined) update.assigneeId = assigneeId;
  if (priority !== undefined) update.priority = priority;
  if (status !== undefined) update.status = status;
  if (dueDate !== undefined) update.dueDate = dueDate;

  const [task] = await db.update(tasksTable).set(update).where(eq(tasksTable.id, id)).returning();
  if (!task) return res.status(404).json({ error: "Task not found" });

  let assigneeName = null;
  if (task.assigneeId) {
    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, task.assigneeId));
    assigneeName = staff?.name ?? null;
  }

  res.json({ ...task, assigneeName });
});

router.delete("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.status(204).send();
});

export default router;
