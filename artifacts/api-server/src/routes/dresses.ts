import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dressesTable } from "@workspace/db/schema";
import { eq, ilike, or, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

function fmt(d: typeof dressesTable.$inferSelect) {
  return {
    ...d,
    rentalPrice: parseFloat(d.rentalPrice as string),
    depositRequired: parseFloat(d.depositRequired as string),
  };
}

router.get("/dresses", async (req, res) => {
  try {
    const { rentalStatus, search } = req.query as Record<string, string>;
    let rows = await db.select().from(dressesTable).orderBy(desc(dressesTable.createdAt));
    if (rentalStatus && rentalStatus !== "all") rows = rows.filter(d => d.rentalStatus === rentalStatus);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q) ||
        (d.color ?? "").toLowerCase().includes(q)
      );
    }
    res.json(rows.map(fmt));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/dresses", async (req, res) => {
  try {
    const { code, name, category, color, size, style, rentalPrice, depositRequired, rentalStatus, condition, notes, imageUrl } = req.body;
    const [dress] = await db.insert(dressesTable).values({
      code, name,
      category: category || "",
      color, size,
      style: style || null,
      rentalPrice: String(rentalPrice || 0),
      depositRequired: String(depositRequired || 0),
      rentalStatus: rentalStatus || "san_sang",
      isAvailable: (rentalStatus || "san_sang") === "san_sang",
      condition: condition || "tot",
      notes: notes || null,
      imageUrl: imageUrl || null,
    }).returning();
    res.status(201).json(fmt(dress));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/dresses/categories", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ category: dressesTable.category })
      .from(dressesTable)
      .where(sql`${dressesTable.category} != ''`)
      .orderBy(dressesTable.category);
    res.json(rows.map(r => r.category).filter(Boolean));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/dresses/:id", async (req, res) => {
  try {
    const [dress] = await db.select().from(dressesTable).where(eq(dressesTable.id, +req.params.id));
    if (!dress) return res.status(404).json({ error: "Dress not found" });
    res.json(fmt(dress));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put("/dresses/:id", async (req, res) => {
  try {
    const { code, name, category, color, size, style, rentalPrice, depositRequired, rentalStatus, condition, notes, imageUrl, isAvailable } = req.body;
    const updates: Record<string, unknown> = {};
    if (code !== undefined) updates.code = code;
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (color !== undefined) updates.color = color;
    if (size !== undefined) updates.size = size;
    if (style !== undefined) updates.style = style;
    if (rentalPrice !== undefined) updates.rentalPrice = String(rentalPrice);
    if (depositRequired !== undefined) updates.depositRequired = String(depositRequired);
    if (condition !== undefined) updates.condition = condition;
    if (notes !== undefined) updates.notes = notes;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (rentalStatus !== undefined) {
      updates.rentalStatus = rentalStatus;
      updates.isAvailable = rentalStatus === "san_sang";
    }
    if (isAvailable !== undefined) {
      updates.isAvailable = isAvailable;
      if (!updates.rentalStatus) updates.rentalStatus = isAvailable ? "san_sang" : "dang_cho_thue";
    }
    const [dress] = await db.update(dressesTable).set(updates as never).where(eq(dressesTable.id, +req.params.id)).returning();
    if (!dress) return res.status(404).json({ error: "Dress not found" });
    res.json(fmt(dress));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete("/dresses/:id", async (req, res) => {
  try {
    await db.delete(dressesTable).where(eq(dressesTable.id, +req.params.id));
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
