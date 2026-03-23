import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customersTable, bookingsTable, paymentsTable } from "@workspace/db/schema";
import { eq, ilike, or, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  const search = req.query.search as string | undefined;
  let customers;
  if (search) {
    customers = await db
      .select()
      .from(customersTable)
      .where(or(ilike(customersTable.name, `%${search}%`), ilike(customersTable.phone, `%${search}%`)));
  } else {
    customers = await db.select().from(customersTable).orderBy(customersTable.createdAt);
  }

  const result = await Promise.all(
    customers.map(async (c) => {
      const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.customerId, c.id));
      const payments = await db.select().from(paymentsTable);
      const bookingIds = bookings.map((b) => b.id);

      const totalPaid = payments
        .filter((p) => p.bookingId && bookingIds.includes(p.bookingId) && p.paymentType !== "refund")
        .reduce((s, p) => s + parseFloat(p.amount), 0);

      const totalOwed = bookings.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
      const totalDebt = Math.max(0, totalOwed - totalPaid);

      return { ...c, totalBookings: bookings.length, totalDebt };
    })
  );

  res.json(result);
});

router.post("/customers", async (req, res) => {
  const { name, phone, email, address, notes } = req.body;
  const [customer] = await db
    .insert(customersTable)
    .values({ name, phone, email, address, notes })
    .returning();
  res.status(201).json({ ...customer, totalBookings: 0, totalDebt: 0 });
});

router.get("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ ...customer, totalBookings: 0, totalDebt: 0 });
});

router.put("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, email, address, notes } = req.body;
  const [customer] = await db
    .update(customersTable)
    .set({ name, phone, email, address, notes })
    .where(eq(customersTable.id, id))
    .returning();
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ ...customer, totalBookings: 0, totalDebt: 0 });
});

router.delete("/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.status(204).send();
});

export default router;
