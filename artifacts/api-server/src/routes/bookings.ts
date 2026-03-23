import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, customersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/bookings", async (req, res) => {
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;

  const rows = await db
    .select({
      id: bookingsTable.id,
      customerId: bookingsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      shootDate: bookingsTable.shootDate,
      shootTime: bookingsTable.shootTime,
      packageType: bookingsTable.packageType,
      status: bookingsTable.status,
      totalAmount: bookingsTable.totalAmount,
      depositAmount: bookingsTable.depositAmount,
      notes: bookingsTable.notes,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(
      and(
        status ? eq(bookingsTable.status, status) : undefined,
        customerId ? eq(bookingsTable.customerId, customerId) : undefined
      )
    )
    .orderBy(bookingsTable.shootDate);

  const bookings = rows.map((b) => ({
    ...b,
    totalAmount: parseFloat(b.totalAmount),
    depositAmount: parseFloat(b.depositAmount),
    remainingAmount: parseFloat(b.totalAmount) - parseFloat(b.depositAmount),
  }));

  res.json(bookings);
});

router.post("/bookings", async (req, res) => {
  const { customerId, shootDate, shootTime, packageType, totalAmount, depositAmount, notes } = req.body;
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      customerId,
      shootDate,
      shootTime,
      packageType,
      totalAmount: String(totalAmount),
      depositAmount: String(depositAmount),
      notes,
      status: "pending",
    })
    .returning();

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));

  res.status(201).json({
    ...booking,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalAmount: parseFloat(booking.totalAmount),
    depositAmount: parseFloat(booking.depositAmount),
    remainingAmount: parseFloat(booking.totalAmount) - parseFloat(booking.depositAmount),
  });
});

router.get("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({
      id: bookingsTable.id,
      customerId: bookingsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      shootDate: bookingsTable.shootDate,
      shootTime: bookingsTable.shootTime,
      packageType: bookingsTable.packageType,
      status: bookingsTable.status,
      totalAmount: bookingsTable.totalAmount,
      depositAmount: bookingsTable.depositAmount,
      notes: bookingsTable.notes,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .innerJoin(customersTable, eq(bookingsTable.customerId, customersTable.id))
    .where(eq(bookingsTable.id, id));

  if (!row) return res.status(404).json({ error: "Booking not found" });
  res.json({
    ...row,
    totalAmount: parseFloat(row.totalAmount),
    depositAmount: parseFloat(row.depositAmount),
    remainingAmount: parseFloat(row.totalAmount) - parseFloat(row.depositAmount),
  });
});

router.put("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { shootDate, shootTime, packageType, status, totalAmount, depositAmount, notes } = req.body;

  const updateData: Record<string, unknown> = {};
  if (shootDate !== undefined) updateData.shootDate = shootDate;
  if (shootTime !== undefined) updateData.shootTime = shootTime;
  if (packageType !== undefined) updateData.packageType = packageType;
  if (status !== undefined) updateData.status = status;
  if (totalAmount !== undefined) updateData.totalAmount = String(totalAmount);
  if (depositAmount !== undefined) updateData.depositAmount = String(depositAmount);
  if (notes !== undefined) updateData.notes = notes;

  const [booking] = await db
    .update(bookingsTable)
    .set(updateData)
    .where(eq(bookingsTable.id, id))
    .returning();

  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, booking.customerId));

  res.json({
    ...booking,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalAmount: parseFloat(booking.totalAmount),
    depositAmount: parseFloat(booking.depositAmount),
    remainingAmount: parseFloat(booking.totalAmount) - parseFloat(booking.depositAmount),
  });
});

router.delete("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(bookingsTable).where(eq(bookingsTable.id, id));
  res.status(204).send();
});

export default router;
