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
const fmtPkg = (p: { price: string; costPrice: string; isActive: number; [k: string]: unknown }) => ({
  ...p, price: parseFloat(p.price), costPrice: parseFloat(p.costPrice), isActive: Boolean(p.isActive),
});
const fmtSurcharge = (s: { price: string; isActive: number; [k: string]: unknown }) => ({
  ...s, price: parseFloat(s.price), isActive: Boolean(s.isActive),
});

async function seedIfEmpty() {
  const existing = await db.select().from(serviceGroupsTable).limit(1);
  if (existing.length > 0) return;

  const groups = await db.insert(serviceGroupsTable).values([
    { name: "Album studio", description: "Chụp ảnh album tại studio", sortOrder: 1 },
    { name: "Chụp ngày cưới", description: "Chụp ảnh phóng sự ngày cưới", sortOrder: 2 },
    { name: "Combo ngày cưới có makeup", description: "Combo chụp + makeup ngày cưới", sortOrder: 3 },
    { name: "Combo ngày cưới không book makeup", description: "Combo chụp ngày cưới không bao makeup", sortOrder: 4 },
    { name: "Trọn gói đám cưới", description: "Gói trọn vẹn 2 ngày đám cưới", sortOrder: 5 },
    { name: "Beauty", description: "Chụp ảnh beauty cô dâu", sortOrder: 6 },
    { name: "Gia đình", description: "Chụp ảnh gia đình", sortOrder: 7 },
    { name: "Quay phim cưới", description: "Quay phim phóng sự ngày cưới", sortOrder: 8 },
    { name: "Thuê lễ / váy / vest / áo dài", description: "Cho thuê trang phục lễ cưới", sortOrder: 9 },
    { name: "In ảnh / ép gỗ / mica", description: "Dịch vụ in ảnh và ép gỗ", sortOrder: 10 },
    { name: "Phụ phí / nâng cấp", description: "Các phụ phí và nâng cấp dịch vụ", sortOrder: 11 },
  ]).returning();

  const [grAlbum, grNgayCuoi, grComboMakeup, grComboNoMakeup, grTronGoi] = groups;

  const pkgs = await db.insert(servicePackagesTable).values([
    { groupId: grAlbum.id, code: "AS-BASIC", name: "Basic", price: "6500000", costPrice: "2000000", description: "Gói album studio cơ bản", sortOrder: 1 },
    { groupId: grAlbum.id, code: "AS-NORMAL", name: "Normal", price: "7500000", costPrice: "2500000", description: "Gói album studio bình thường", sortOrder: 2 },
    { groupId: grAlbum.id, code: "AS-LUXURY", name: "Luxury", price: "9500000", costPrice: "3000000", description: "Gói album studio cao cấp", sortOrder: 3 },
    { groupId: grNgayCuoi.id, code: "NC-BASIC", name: "Basic", price: "3000000", costPrice: "1000000", description: "Gói chụp ngày cưới cơ bản", sortOrder: 1 },
    { groupId: grNgayCuoi.id, code: "NC-PREMIUM", name: "Premium", price: "4500000", costPrice: "1500000", description: "Gói chụp ngày cưới premium", sortOrder: 2 },
    { groupId: grNgayCuoi.id, code: "NC-LUXURY", name: "Luxury", price: "7000000", costPrice: "2000000", description: "Gói chụp ngày cưới cao cấp", sortOrder: 3 },
    { groupId: grComboMakeup.id, code: "CM-SILVER", name: "Silver", price: "6000000", costPrice: "2500000", description: "Combo ngày cưới có makeup - Silver", sortOrder: 1 },
    { groupId: grComboMakeup.id, code: "CM-GOLD", name: "Gold", price: "9000000", costPrice: "3500000", description: "Combo ngày cưới có makeup - Gold", sortOrder: 2 },
    { groupId: grComboMakeup.id, code: "CM-DIAMOND", name: "Diamond", price: "11000000", costPrice: "4500000", description: "Combo ngày cưới có makeup - Diamond", sortOrder: 3 },
    { groupId: grComboMakeup.id, code: "CM-LUXURY", name: "Luxury", price: "13000000", costPrice: "5500000", description: "Combo ngày cưới có makeup - Luxury", sortOrder: 4 },
    { groupId: grComboNoMakeup.id, code: "CN-SILVER", name: "Silver", price: "4500000", costPrice: "1800000", description: "Combo ngày cưới không makeup - Silver", sortOrder: 1 },
    { groupId: grComboNoMakeup.id, code: "CN-GOLD", name: "Gold", price: "5900000", costPrice: "2200000", description: "Combo ngày cưới không makeup - Gold", sortOrder: 2 },
    { groupId: grComboNoMakeup.id, code: "CN-DIAMOND", name: "Diamond", price: "7900000", costPrice: "2800000", description: "Combo ngày cưới không makeup - Diamond", sortOrder: 3 },
    { groupId: grComboNoMakeup.id, code: "CN-LUXURY", name: "Luxury", price: "9900000", costPrice: "3500000", description: "Combo ngày cưới không makeup - Luxury", sortOrder: 4 },
    { groupId: grTronGoi.id, code: "TG-2DAY", name: "Trọn gói 2 ngày", price: "13000000", costPrice: "6000000", description: "Trọn gói đám cưới 2 ngày đầy đủ", sortOrder: 1 },
  ]).returning();

  const pkgBasicAlbum = pkgs[0];
  await db.insert(packageItemsTable).values([
    { packageId: pkgBasicAlbum.id, name: "Sare", quantity: "2", unit: "bộ", sortOrder: 1 },
    { packageId: pkgBasicAlbum.id, name: "Vest", quantity: "2", unit: "bộ", sortOrder: 2 },
    { packageId: pkgBasicAlbum.id, name: "Bao trang điểm", quantity: "1", unit: "lần", sortOrder: 3 },
    { packageId: pkgBasicAlbum.id, name: "Album 25x35cm 20 trang in lụa", quantity: "1", unit: "cuốn", sortOrder: 4 },
    { packageId: pkgBasicAlbum.id, name: "Hình cổng 60x90cm in lụa ép gỗ", quantity: "2", unit: "tấm", sortOrder: 5 },
    { packageId: pkgBasicAlbum.id, name: "Toàn bộ file gốc (tặng)", quantity: "1", unit: "bộ", notes: "Tặng kèm", sortOrder: 6 },
    { packageId: pkgBasicAlbum.id, name: "Hình 13x18cm", quantity: "10", unit: "tấm", notes: "Tặng kèm", sortOrder: 7 },
  ]);

  const pkgNormalAlbum = pkgs[1];
  await db.insert(packageItemsTable).values([
    { packageId: pkgNormalAlbum.id, name: "Sare", quantity: "3", unit: "bộ", sortOrder: 1 },
    { packageId: pkgNormalAlbum.id, name: "Vest", quantity: "3", unit: "bộ", sortOrder: 2 },
    { packageId: pkgNormalAlbum.id, name: "Bao trang điểm", quantity: "1", unit: "lần", sortOrder: 3 },
    { packageId: pkgNormalAlbum.id, name: "Album 25x35cm 24 trang in lụa", quantity: "1", unit: "cuốn", sortOrder: 4 },
    { packageId: pkgNormalAlbum.id, name: "Hình cổng 60x90cm in lụa ép gỗ", quantity: "2", unit: "tấm", sortOrder: 5 },
    { packageId: pkgNormalAlbum.id, name: "Toàn bộ file gốc (tặng)", quantity: "1", unit: "bộ", notes: "Tặng kèm", sortOrder: 6 },
    { packageId: pkgNormalAlbum.id, name: "Hình 13x18cm", quantity: "20", unit: "tấm", notes: "Tặng kèm", sortOrder: 7 },
  ]);

  const pkgNgayCuoiBasic = pkgs[3];
  await db.insert(packageItemsTable).values([
    { packageId: pkgNgayCuoiBasic.id, name: "Chụp lễ gia tiên", quantity: "1", unit: "buổi", sortOrder: 1 },
    { packageId: pkgNgayCuoiBasic.id, name: "Chụp tiệc cưới", quantity: "1", unit: "buổi", sortOrder: 2 },
    { packageId: pkgNgayCuoiBasic.id, name: "Nhiếp ảnh gia", quantity: "1", unit: "người", sortOrder: 3 },
    { packageId: pkgNgayCuoiBasic.id, name: "File ảnh đã chỉnh màu", quantity: "200", unit: "ảnh", sortOrder: 4 },
  ]);

  const pkgComboSilver = pkgs[6];
  await db.insert(packageItemsTable).values([
    { packageId: pkgComboSilver.id, name: "Chụp ngày cưới", quantity: "1", unit: "ngày", sortOrder: 1 },
    { packageId: pkgComboSilver.id, name: "Makeup cô dâu", quantity: "1", unit: "lần", sortOrder: 2 },
    { packageId: pkgComboSilver.id, name: "Nhiếp ảnh gia", quantity: "1", unit: "người", sortOrder: 3 },
    { packageId: pkgComboSilver.id, name: "File ảnh đã chỉnh màu", quantity: "300", unit: "ảnh", sortOrder: 4 },
    { packageId: pkgComboSilver.id, name: "Album 20x30cm 20 trang", quantity: "1", unit: "cuốn", sortOrder: 5 },
  ]);

  const pkgTronGoi = pkgs[14];
  await db.insert(packageItemsTable).values([
    { packageId: pkgTronGoi.id, name: "Chụp lễ gia tiên", quantity: "1", unit: "buổi", sortOrder: 1 },
    { packageId: pkgTronGoi.id, name: "Chụp tiệc cưới", quantity: "1", unit: "buổi", sortOrder: 2 },
    { packageId: pkgTronGoi.id, name: "Quay phim", quantity: "1", unit: "ngày", sortOrder: 3 },
    { packageId: pkgTronGoi.id, name: "Makeup cô dâu + chú rể", quantity: "1", unit: "lần", sortOrder: 4 },
    { packageId: pkgTronGoi.id, name: "Album 25x35cm 30 trang in lụa", quantity: "1", unit: "cuốn", sortOrder: 5 },
    { packageId: pkgTronGoi.id, name: "Hình cổng 60x90cm ép gỗ", quantity: "4", unit: "tấm", sortOrder: 6 },
    { packageId: pkgTronGoi.id, name: "Video highlight 5-7 phút", quantity: "1", unit: "clip", sortOrder: 7 },
    { packageId: pkgTronGoi.id, name: "Toàn bộ file gốc", quantity: "1", unit: "bộ", notes: "Tặng kèm", sortOrder: 8 },
  ]);

  await db.insert(surchargesTable).values([
    { name: "Nâng cấp album ngọc trai", category: "Nâng cấp album", price: "500000", unit: "lần", sortOrder: 1 },
    { name: "Tiệc chiều tối", category: "Phụ phí thời gian", price: "2000000", unit: "buổi", sortOrder: 2 },
    { name: "Tiệc trên 40 bàn", category: "Phụ phí đám cưới", price: "500000", unit: "lần", sortOrder: 3 },
    { name: "Chỉnh & bóp dáng 20 tấm", category: "Nâng cấp xử lý ảnh", price: "300000", unit: "lần", sortOrder: 4 },
    { name: "Makeup chú rể", category: "Nâng cấp makeup", price: "500000", unit: "lần", sortOrder: 5 },
    { name: "Makeup phụ dâu", category: "Nâng cấp makeup", price: "400000", unit: "người", sortOrder: 6 },
    { name: "Phụ phí xa trung tâm", category: "Phụ phí di chuyển", price: "200000", unit: "km", sortOrder: 7 },
    { name: "Thuê thêm váy cưới", category: "Thuê trang phục", price: "800000", unit: "bộ", sortOrder: 8 },
    { name: "Nâng cấp số trang album", category: "Nâng cấp album", price: "150000", unit: "trang", sortOrder: 9 },
    { name: "Thêm hình phóng sự", category: "Nâng cấp xử lý ảnh", price: "500000", unit: "lần", sortOrder: 10 },
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
  const { groupId, code, name, price, costPrice, description, notes, isActive, sortOrder, items = [] } = req.body;
  const [pkg] = await db.insert(servicePackagesTable).values({
    groupId: groupId ? parseInt(groupId) : null,
    code, name,
    price: String(price ?? 0),
    costPrice: String(costPrice ?? 0),
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
  const { groupId, code, name, price, costPrice, description, notes, isActive, sortOrder, items } = req.body;

  const [pkg] = await db.update(servicePackagesTable).set({
    groupId: groupId !== undefined ? (groupId ? parseInt(groupId) : null) : undefined,
    code, name,
    price: price !== undefined ? String(price) : undefined,
    costPrice: costPrice !== undefined ? String(costPrice) : undefined,
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
