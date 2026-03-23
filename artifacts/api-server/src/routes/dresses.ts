import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dressesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dresses", async (req, res) => {
  const available = req.query.available;
  let dresses;
  if (available === "true") {
    dresses = await db.select().from(dressesTable).where(eq(dressesTable.isAvailable, true));
  } else if (available === "false") {
    dresses = await db.select().from(dressesTable).where(eq(dressesTable.isAvailable, false));
  } else {
    dresses = await db.select().from(dressesTable).orderBy(dressesTable.code);
  }
  res.json(
    dresses.map((d) => ({
      ...d,
      rentalPrice: parseFloat(d.rentalPrice),
      depositRequired: parseFloat(d.depositRequired),
    }))
  );
});

router.post("/dresses", async (req, res) => {
  const { code, name, color, size, style, rentalPrice, depositRequired, condition, notes, imageUrl } = req.body;
  const [dress] = await db
    .insert(dressesTable)
    .values({
      code,
      name,
      color,
      size,
      style,
      rentalPrice: String(rentalPrice),
      depositRequired: String(depositRequired),
      condition,
      notes,
      imageUrl,
    })
    .returning();
  res.status(201).json({
    ...dress,
    rentalPrice: parseFloat(dress.rentalPrice),
    depositRequired: parseFloat(dress.depositRequired),
  });
});

router.get("/dresses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [dress] = await db.select().from(dressesTable).where(eq(dressesTable.id, id));
  if (!dress) return res.status(404).json({ error: "Dress not found" });
  res.json({
    ...dress,
    rentalPrice: parseFloat(dress.rentalPrice),
    depositRequired: parseFloat(dress.depositRequired),
  });
});

router.put("/dresses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { code, name, color, size, style, rentalPrice, depositRequired, condition, notes, imageUrl, isAvailable } = req.body;
  const [dress] = await db
    .update(dressesTable)
    .set({
      code,
      name,
      color,
      size,
      style,
      rentalPrice: rentalPrice !== undefined ? String(rentalPrice) : undefined,
      depositRequired: depositRequired !== undefined ? String(depositRequired) : undefined,
      condition,
      notes,
      imageUrl,
      isAvailable,
    })
    .where(eq(dressesTable.id, id))
    .returning();
  if (!dress) return res.status(404).json({ error: "Dress not found" });
  res.json({
    ...dress,
    rentalPrice: parseFloat(dress.rentalPrice),
    depositRequired: parseFloat(dress.depositRequired),
  });
});

router.delete("/dresses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(dressesTable).where(eq(dressesTable.id, id));
  res.status(204).send();
});

export default router;
