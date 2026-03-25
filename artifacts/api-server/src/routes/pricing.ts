import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  serviceGroupsTable, servicePackagesTable, packageItemsTable, surchargesTable
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

const fmtGroup = (g: { isActive: number; [k: string]: unknown }) => ({
  ...g, isActive: Boolean(g.isActive),
});
const fmtPkg = (p: { price: string; costPrice: string; printCost: string; operatingCost: string; salePercent: string; isActive: number; [k: string]: unknown }) => ({
  ...p,
  price: parseFloat(p.price),
  costPrice: parseFloat(p.costPrice),
  printCost: parseFloat(p.printCost ?? "0"),
  operatingCost: parseFloat(p.operatingCost ?? "0"),
  salePercent: parseFloat(p.salePercent ?? "0"),
  isActive: Boolean(p.isActive),
});
const fmtSurcharge = (s: { price: string; isActive: number; [k: string]: unknown }) => ({
  ...s, price: parseFloat(s.price), isActive: Boolean(s.isActive),
});

async function seedIfEmpty() {
  // Check for the real "CHỤP ẢNH CỔNG STUDIO" group specifically
  const existing = await db.select().from(serviceGroupsTable).where(eq(serviceGroupsTable.name, "CHỤP ẢNH CỔNG STUDIO")).limit(1);
  if (existing.length > 0) return;

  // Clear all old demo data
  await db.delete(packageItemsTable);
  await db.delete(servicePackagesTable);
  await db.delete(serviceGroupsTable);

  // ── Nhóm CHỤP ẢNH CỔNG STUDIO ──────────────────────────────────────────────
  const [grCong] = await db.insert(serviceGroupsTable).values([
    { name: "CHỤP ẢNH CỔNG STUDIO", description: "Gói chụp ảnh cổng tại studio — FINAL", sortOrder: 1 },
  ]).returning();

  // costPrice is a rough total cost (print+operating); real staff costs computed dynamically
  const [pkgBasic, pkgPremium, pkgLuxury] = await db.insert(servicePackagesTable).values([
    {
      groupId: grCong.id, code: "CONG-BASIC", name: "Gói BASIC",
      price: "2900000",
      costPrice: "700000",   // print+operating only (staff not included here)
      printCost: "500000",
      operatingCost: "200000",
      salePercent: "10",
      description: "Gói Basic — 1 sare + 1 vest, 2 hình cổng 60×90 ép gỗ in lụa, 5 hình 13×18, tặng file gốc",
      sortOrder: 1,
    },
    {
      groupId: grCong.id, code: "CONG-PREMIUM", name: "Gói PREMIUM",
      price: "3900000",
      costPrice: "700000",
      printCost: "500000",
      operatingCost: "200000",
      salePercent: "10",
      description: "Gói Premium — 2 sare + 2 vest, 2 hình cổng mica gương, 10 hình nhỏ, tặng file gốc",
      sortOrder: 2,
    },
    {
      groupId: grCong.id, code: "CONG-LUXURY", name: "Gói LUXURY",
      price: "5900000",
      costPrice: "800000",
      printCost: "500000",
      operatingCost: "300000",
      salePercent: "10",
      description: "Gói Luxury — 2 sare + 2 vest, photographer master + makeup master, 2 hình cổng mica gương, 10 hình khung cao cấp, tặng file gốc",
      sortOrder: 3,
    },
  ]).returning();

  // Package items — gói BASIC
  await db.insert(packageItemsTable).values([
    { packageId: pkgBasic.id, name: "Sare", quantity: "1", unit: "bộ", sortOrder: 1 },
    { packageId: pkgBasic.id, name: "Vest", quantity: "1", unit: "bộ", sortOrder: 2 },
    { packageId: pkgBasic.id, name: "Nhiếp ảnh gia", quantity: "1", unit: "người", sortOrder: 3 },
    { packageId: pkgBasic.id, name: "Trang điểm", quantity: "1", unit: "lần", sortOrder: 4 },
    { packageId: pkgBasic.id, name: "Hình cổng 60×90 ép gỗ in lụa", quantity: "2", unit: "tấm", sortOrder: 5 },
    { packageId: pkgBasic.id, name: "Hình 13×18", quantity: "5", unit: "tấm", notes: "Tặng kèm", sortOrder: 6 },
    { packageId: pkgBasic.id, name: "File gốc", quantity: "1", unit: "bộ", notes: "Tặng kèm", sortOrder: 7 },
  ]);

  // Package items — gói PREMIUM
  await db.insert(packageItemsTable).values([
    { packageId: pkgPremium.id, name: "Sare", quantity: "2", unit: "bộ", sortOrder: 1 },
    { packageId: pkgPremium.id, name: "Vest", quantity: "2", unit: "bộ", sortOrder: 2 },
    { packageId: pkgPremium.id, name: "Nhiếp ảnh gia", quantity: "1", unit: "người", sortOrder: 3 },
    { packageId: pkgPremium.id, name: "Trang điểm", quantity: "1", unit: "lần", sortOrder: 4 },
    { packageId: pkgPremium.id, name: "Hình cổng mica gương", quantity: "2", unit: "tấm", sortOrder: 5 },
    { packageId: pkgPremium.id, name: "Hình nhỏ", quantity: "10", unit: "tấm", notes: "Tặng kèm", sortOrder: 6 },
    { packageId: pkgPremium.id, name: "File gốc", quantity: "1", unit: "bộ", notes: "Tặng kèm", sortOrder: 7 },
  ]);

  // Package items — gói LUXURY
  await db.insert(packageItemsTable).values([
    { packageId: pkgLuxury.id, name: "Sare", quantity: "2", unit: "bộ", sortOrder: 1 },
    { packageId: pkgLuxury.id, name: "Vest", quantity: "2", unit: "bộ", sortOrder: 2 },
    { packageId: pkgLuxury.id, name: "Nhiếp ảnh gia master", quantity: "1", unit: "người", sortOrder: 3 },
    { packageId: pkgLuxury.id, name: "Trang điểm master", quantity: "1", unit: "lần", sortOrder: 4 },
    { packageId: pkgLuxury.id, name: "Hình cổng mica gương", quantity: "2", unit: "tấm", sortOrder: 5 },
    { packageId: pkgLuxury.id, name: "Hình khung cao cấp", quantity: "10", unit: "tấm", notes: "Tặng kèm", sortOrder: 6 },
    { packageId: pkgLuxury.id, name: "File gốc", quantity: "1", unit: "bộ", notes: "Tặng kèm", sortOrder: 7 },
  ]);
}

seedIfEmpty().catch(console.error);

router.get("/service-groups", async (_req, res) => {
  const groups = await db.select().from(serviceGroupsTable).orderBy(asc(serviceGroupsTable.sortOrder));
  res.json(groups.map(fmtGroup));
});

router.post("/service-groups", async (req, res) => {
  const { name, description, sortOrder, isActive } = req.body;
  const [g] = await db.insert(serviceGroupsTable).values({
    name, description, sortOrder: sortOrder ?? 0, isActive: isActive !== false ? 1 : 0,
  }).returning();
  res.status(201).json(fmtGroup(g));
});

router.put("/service-groups/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, sortOrder, isActive } = req.body;
  const [g] = await db.update(serviceGroupsTable).set({
    name, description,
    sortOrder: sortOrder !== undefined ? sortOrder : undefined,
    isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined,
  }).where(eq(serviceGroupsTable.id, id)).returning();
  if (!g) return res.status(404).json({ error: "Not found" });
  res.json(fmtGroup(g));
});

router.delete("/service-groups/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(serviceGroupsTable).where(eq(serviceGroupsTable.id, id));
  res.status(204).send();
});

router.get("/service-packages", async (_req, res) => {
  const packages = await db.select().from(servicePackagesTable).orderBy(asc(servicePackagesTable.groupId), asc(servicePackagesTable.sortOrder));
  const items = await db.select().from(packageItemsTable).orderBy(asc(packageItemsTable.packageId), asc(packageItemsTable.sortOrder));
  const result = packages.map(p => ({
    ...fmtPkg(p),
    items: items.filter(i => i.packageId === p.id),
  }));
  res.json(result);
});

router.get("/service-packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [pkg] = await db.select().from(servicePackagesTable).where(eq(servicePackagesTable.id, id));
  if (!pkg) return res.status(404).json({ error: "Not found" });
  const items = await db.select().from(packageItemsTable).where(eq(packageItemsTable.packageId, id)).orderBy(asc(packageItemsTable.sortOrder));
  res.json({ ...fmtPkg(pkg), items });
});

router.post("/service-packages", async (req, res) => {
  const { groupId, code, name, price, costPrice, printCost, operatingCost, salePercent, description, notes, isActive, sortOrder, items = [] } = req.body;
  const [pkg] = await db.insert(servicePackagesTable).values({
    groupId: groupId ? parseInt(groupId) : null,
    code, name,
    price: String(price ?? 0),
    costPrice: String(costPrice ?? 0),
    printCost: String(printCost ?? 0),
    operatingCost: String(operatingCost ?? 0),
    salePercent: String(salePercent ?? 0),
    description, notes,
    isActive: isActive !== false ? 1 : 0,
    sortOrder: sortOrder ?? 0,
  }).returning();

  if (items.length > 0) {
    await db.insert(packageItemsTable).values(
      items.map((item: { name: string; quantity?: string; unit?: string; notes?: string; sortOrder?: number }, idx: number) => ({
        packageId: pkg.id,
        name: item.name,
        quantity: String(item.quantity ?? "1"),
        unit: item.unit,
        notes: item.notes,
        sortOrder: item.sortOrder ?? idx,
      }))
    );
  }

  const savedItems = await db.select().from(packageItemsTable).where(eq(packageItemsTable.packageId, pkg.id)).orderBy(asc(packageItemsTable.sortOrder));
  res.status(201).json({ ...fmtPkg(pkg), items: savedItems });
});

router.put("/service-packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { groupId, code, name, price, costPrice, printCost, operatingCost, salePercent, description, notes, isActive, sortOrder, items } = req.body;

  const [pkg] = await db.update(servicePackagesTable).set({
    groupId: groupId !== undefined ? (groupId ? parseInt(groupId) : null) : undefined,
    code, name,
    price: price !== undefined ? String(price) : undefined,
    costPrice: costPrice !== undefined ? String(costPrice) : undefined,
    printCost: printCost !== undefined ? String(printCost) : undefined,
    operatingCost: operatingCost !== undefined ? String(operatingCost) : undefined,
    salePercent: salePercent !== undefined ? String(salePercent) : undefined,
    description, notes,
    isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined,
    sortOrder: sortOrder !== undefined ? sortOrder : undefined,
  }).where(eq(servicePackagesTable.id, id)).returning();

  if (!pkg) return res.status(404).json({ error: "Not found" });

  if (Array.isArray(items)) {
    await db.delete(packageItemsTable).where(eq(packageItemsTable.packageId, id));
    if (items.length > 0) {
      await db.insert(packageItemsTable).values(
        items.map((item: { name: string; quantity?: string; unit?: string; notes?: string; sortOrder?: number }, idx: number) => ({
          packageId: id,
          name: item.name,
          quantity: String(item.quantity ?? "1"),
          unit: item.unit,
          notes: item.notes,
          sortOrder: item.sortOrder ?? idx,
        }))
      );
    }
  }

  const savedItems = await db.select().from(packageItemsTable).where(eq(packageItemsTable.packageId, id)).orderBy(asc(packageItemsTable.sortOrder));
  res.json({ ...fmtPkg(pkg), items: savedItems });
});

router.delete("/service-packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(packageItemsTable).where(eq(packageItemsTable.packageId, id));
  await db.delete(servicePackagesTable).where(eq(servicePackagesTable.id, id));
  res.status(204).send();
});

router.get("/surcharges", async (_req, res) => {
  const rows = await db.select().from(surchargesTable).orderBy(asc(surchargesTable.sortOrder));
  res.json(rows.map(fmtSurcharge));
});

router.post("/surcharges", async (req, res) => {
  const { name, category, price, unit, description, isActive, sortOrder } = req.body;
  const [s] = await db.insert(surchargesTable).values({
    name, category, price: String(price ?? 0), unit: unit ?? "lần",
    description, isActive: isActive !== false ? 1 : 0, sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json(fmtSurcharge(s));
});

router.put("/surcharges/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, category, price, unit, description, isActive, sortOrder } = req.body;
  const [s] = await db.update(surchargesTable).set({
    name, category,
    price: price !== undefined ? String(price) : undefined,
    unit, description,
    isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined,
    sortOrder: sortOrder !== undefined ? sortOrder : undefined,
  }).where(eq(surchargesTable.id, id)).returning();
  if (!s) return res.status(404).json({ error: "Not found" });
  res.json(fmtSurcharge(s));
});

router.delete("/surcharges/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(surchargesTable).where(eq(surchargesTable.id, id));
  res.status(204).send();
});

export default router;
