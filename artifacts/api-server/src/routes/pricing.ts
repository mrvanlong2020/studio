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

const fmtPkg = (p: {
  price: string; costPrice: string; printCost: string; operatingCost: string;
  salePercent: string; isActive: number; addons: string | null; products: string | null;
  serviceType?: string | null; photoCount?: number | null; [k: string]: unknown
}) => ({
  ...p,
  price: parseFloat(p.price),
  costPrice: parseFloat(p.costPrice),
  printCost: parseFloat(p.printCost ?? "0"),
  operatingCost: parseFloat(p.operatingCost ?? "0"),
  salePercent: parseFloat(p.salePercent ?? "0"),
  isActive: Boolean(p.isActive),
  addons: p.addons ? (() => { try { return JSON.parse(p.addons!); } catch { return []; } })() : [],
  products: p.products ? (() => { try { return JSON.parse(p.products!); } catch { return []; } })() : [],
  serviceType: p.serviceType ?? null,
  photoCount: p.photoCount ?? 1,
});

const fmtSurcharge = (s: { price: string; isActive: number; [k: string]: unknown }) => ({
  ...s, price: parseFloat(s.price), isActive: Boolean(s.isActive),
});

// ─── Addon options chuẩn (dùng trong mọi gói) ────────────────────────────────
const ADDONS_NGOAI_CANH = JSON.stringify([
  { key: "nang_album",    name: "Nâng album (30×40 → 40×60)",        price: 500000 },
  { key: "makeup_chu_re", name: "Makeup chú rể",                      price: 300000 },
  { key: "video_hau_truong", name: "Video hậu trường (1-2 phút)",     price: 800000 },
  { key: "them_ngoai_canh",  name: "Thêm 1 địa điểm ngoại cảnh",    price: 1000000 },
  { key: "nang_trang_phuc",  name: "Nâng trang phục (thêm 1 sare)",  price: 500000 },
]);

const ADDONS_STUDIO = JSON.stringify([
  { key: "nang_album",    name: "Nâng album (30×40 → 40×60)",        price: 400000 },
  { key: "makeup_chu_re", name: "Makeup chú rể",                      price: 300000 },
  { key: "video_hau_truong", name: "Video hậu trường (1-2 phút)",     price: 800000 },
  { key: "them_background",  name: "Thêm 1 background studio",        price: 300000 },
  { key: "nang_trang_phuc",  name: "Nâng trang phục (thêm 1 sare)",  price: 400000 },
]);

async function seedIfEmpty() {
  const existing = await db.select()
    .from(serviceGroupsTable)
    .where(eq(serviceGroupsTable.name, "ALBUM NGOẠI CẢNH"))
    .limit(1);
  if (existing.length > 0) return;

  // Xóa data cũ
  await db.delete(packageItemsTable);
  await db.delete(servicePackagesTable);
  await db.delete(serviceGroupsTable);

  // ─── Nhóm 1: ALBUM NGOẠI CẢNH ────────────────────────────────────────────
  const [grNC] = await db.insert(serviceGroupsTable).values([
    { name: "ALBUM NGOẠI CẢNH", description: "Chụp ảnh album tại địa điểm ngoại cảnh", sortOrder: 1 },
  ]).returning();

  const [ncBasic, ncNormal, ncLuxury] = await db.insert(servicePackagesTable).values([
    {
      groupId: grNC.id, code: "NC-BASIC", name: "Album ngoại cảnh Basic",
      price: "7500000", costPrice: "800000",
      printCost: "500000", operatingCost: "300000", salePercent: "10",
      description: "Chụp 1 địa điểm ngoại cảnh — 2 sare cô dâu",
      addons: ADDONS_NGOAI_CANH,
      products: JSON.stringify([
        "Album 30×40 (10 trang láng bóng)",
        "2 tấm hình treo tường 60×90",
        "USB + file ảnh gốc đã chỉnh màu",
      ]),
      sortOrder: 1,
    },
    {
      groupId: grNC.id, code: "NC-NORMAL", name: "Album ngoại cảnh Normal",
      price: "12000000", costPrice: "1000000",
      printCost: "700000", operatingCost: "300000", salePercent: "10",
      description: "Chụp 2 địa điểm ngoại cảnh — 3 sare + 1 vest",
      addons: ADDONS_NGOAI_CANH,
      products: JSON.stringify([
        "Album 30×40 (20 trang láng bóng)",
        "2 tấm hình treo tường 60×90 khung gỗ",
        "1 tấm hình mica gương 40×60",
        "USB + file ảnh gốc đã chỉnh màu",
      ]),
      sortOrder: 2,
    },
    {
      groupId: grNC.id, code: "NC-LUXURY", name: "Album ngoại cảnh Luxury",
      price: "18000000", costPrice: "1200000",
      printCost: "900000", operatingCost: "300000", salePercent: "10",
      description: "Chụp 3 địa điểm ngoại cảnh — 4 sare + 2 vest — photographer & makeup master",
      addons: ADDONS_NGOAI_CANH,
      products: JSON.stringify([
        "Album 40×60 (30 trang láng bóng cao cấp)",
        "4 tấm hình treo tường 60×90 khung gỗ cao cấp",
        "2 tấm hình mica gương 60×90",
        "Video slideshow nhạc nền 5 phút",
        "USB + file ảnh gốc đã chỉnh màu",
      ]),
      sortOrder: 3,
    },
  ]).returning();

  // Bao gồm — NC Basic
  await db.insert(packageItemsTable).values([
    { packageId: ncBasic.id, name: "Nhiếp ảnh gia",         quantity: "1", unit: "người",  sortOrder: 1 },
    { packageId: ncBasic.id, name: "Trang điểm cô dâu",     quantity: "1", unit: "lần",    sortOrder: 2 },
    { packageId: ncBasic.id, name: "Sare cô dâu",           quantity: "2", unit: "bộ",     sortOrder: 3 },
    { packageId: ncBasic.id, name: "Địa điểm ngoại cảnh",   quantity: "1", unit: "nơi",    sortOrder: 4 },
    { packageId: ncBasic.id, name: "Hỗ trợ phục trang",     quantity: "1", unit: "người",  sortOrder: 5 },
  ]);

  // Bao gồm — NC Normal
  await db.insert(packageItemsTable).values([
    { packageId: ncNormal.id, name: "Nhiếp ảnh gia",        quantity: "1", unit: "người",  sortOrder: 1 },
    { packageId: ncNormal.id, name: "Trang điểm cô dâu",    quantity: "1", unit: "lần",    sortOrder: 2 },
    { packageId: ncNormal.id, name: "Sare cô dâu",          quantity: "3", unit: "bộ",     sortOrder: 3 },
    { packageId: ncNormal.id, name: "Vest chú rể",          quantity: "1", unit: "bộ",     sortOrder: 4 },
    { packageId: ncNormal.id, name: "Địa điểm ngoại cảnh",  quantity: "2", unit: "nơi",    sortOrder: 5 },
    { packageId: ncNormal.id, name: "Hỗ trợ phục trang",    quantity: "1", unit: "người",  sortOrder: 6 },
  ]);

  // Bao gồm — NC Luxury
  await db.insert(packageItemsTable).values([
    { packageId: ncLuxury.id, name: "Nhiếp ảnh gia master", quantity: "1", unit: "người",  sortOrder: 1 },
    { packageId: ncLuxury.id, name: "Makeup master",        quantity: "1", unit: "người",  sortOrder: 2 },
    { packageId: ncLuxury.id, name: "Sare cô dâu",          quantity: "4", unit: "bộ",     sortOrder: 3 },
    { packageId: ncLuxury.id, name: "Vest chú rể",          quantity: "2", unit: "bộ",     sortOrder: 4 },
    { packageId: ncLuxury.id, name: "Địa điểm ngoại cảnh",  quantity: "3", unit: "nơi",    sortOrder: 5 },
    { packageId: ncLuxury.id, name: "Trợ lý kỹ thuật",     quantity: "1", unit: "người",  sortOrder: 6 },
    { packageId: ncLuxury.id, name: "Drone / flycam",       quantity: "1", unit: "buổi",   notes: "Tặng kèm", sortOrder: 7 },
  ]);

  // ─── Nhóm 2: ALBUM TẠI STUDIO ─────────────────────────────────────────────
  const [grST] = await db.insert(serviceGroupsTable).values([
    { name: "ALBUM TẠI STUDIO", description: "Chụp ảnh album tại studio với background đa dạng", sortOrder: 2 },
  ]).returning();

  const [stBasic, stNormal, stLuxury] = await db.insert(servicePackagesTable).values([
    {
      groupId: grST.id, code: "ST-BASIC", name: "Album studio Basic",
      price: "5500000", costPrice: "700000",
      printCost: "500000", operatingCost: "200000", salePercent: "10",
      description: "Chụp studio — 2 background — 2 sare cô dâu",
      addons: ADDONS_STUDIO,
      products: JSON.stringify([
        "Album 30×40 (10 trang láng bóng)",
        "2 tấm hình cổng 60×90 ép gỗ in lụa",
        "5 tấm hình 13×18 (tặng kèm)",
        "USB + file ảnh gốc đã chỉnh màu",
      ]),
      sortOrder: 1,
    },
    {
      groupId: grST.id, code: "ST-NORMAL", name: "Album studio Normal",
      price: "8500000", costPrice: "900000",
      printCost: "600000", operatingCost: "300000", salePercent: "10",
      description: "Chụp studio — 3 background — 3 sare + 1 vest",
      addons: ADDONS_STUDIO,
      products: JSON.stringify([
        "Album 30×40 (20 trang láng bóng)",
        "2 tấm hình cổng mica gương 60×90",
        "10 tấm hình 13×18 (tặng kèm)",
        "USB + file ảnh gốc đã chỉnh màu",
      ]),
      sortOrder: 2,
    },
    {
      groupId: grST.id, code: "ST-LUXURY", name: "Album studio Luxury",
      price: "14000000", costPrice: "1100000",
      printCost: "800000", operatingCost: "300000", salePercent: "10",
      description: "Chụp studio — 4 background — 4 sare + 2 vest — photographer & makeup master",
      addons: ADDONS_STUDIO,
      products: JSON.stringify([
        "Album 40×60 (30 trang bìa da cao cấp)",
        "4 tấm hình cổng mica gương 60×90 khung gỗ cao cấp",
        "Video slideshow nhạc nền 5 phút",
        "USB + file ảnh gốc đã chỉnh màu",
      ]),
      sortOrder: 3,
    },
  ]).returning();

  // Bao gồm — ST Basic
  await db.insert(packageItemsTable).values([
    { packageId: stBasic.id, name: "Nhiếp ảnh gia",         quantity: "1", unit: "người",  sortOrder: 1 },
    { packageId: stBasic.id, name: "Trang điểm cô dâu",     quantity: "1", unit: "lần",    sortOrder: 2 },
    { packageId: stBasic.id, name: "Sare cô dâu",           quantity: "2", unit: "bộ",     sortOrder: 3 },
    { packageId: stBasic.id, name: "Background studio",     quantity: "2", unit: "cái",    sortOrder: 4 },
  ]);

  // Bao gồm — ST Normal
  await db.insert(packageItemsTable).values([
    { packageId: stNormal.id, name: "Nhiếp ảnh gia",        quantity: "1", unit: "người",  sortOrder: 1 },
    { packageId: stNormal.id, name: "Trang điểm cô dâu",    quantity: "1", unit: "lần",    sortOrder: 2 },
    { packageId: stNormal.id, name: "Sare cô dâu",          quantity: "3", unit: "bộ",     sortOrder: 3 },
    { packageId: stNormal.id, name: "Vest chú rể",          quantity: "1", unit: "bộ",     sortOrder: 4 },
    { packageId: stNormal.id, name: "Background studio",    quantity: "3", unit: "cái",    sortOrder: 5 },
  ]);

  // Bao gồm — ST Luxury
  await db.insert(packageItemsTable).values([
    { packageId: stLuxury.id, name: "Nhiếp ảnh gia master", quantity: "1", unit: "người",  sortOrder: 1 },
    { packageId: stLuxury.id, name: "Makeup master",        quantity: "1", unit: "người",  sortOrder: 2 },
    { packageId: stLuxury.id, name: "Sare cô dâu",          quantity: "4", unit: "bộ",     sortOrder: 3 },
    { packageId: stLuxury.id, name: "Vest chú rể",          quantity: "2", unit: "bộ",     sortOrder: 4 },
    { packageId: stLuxury.id, name: "Background studio",    quantity: "4", unit: "cái",    sortOrder: 5 },
    { packageId: stLuxury.id, name: "Trợ lý kỹ thuật",     quantity: "1", unit: "người",  sortOrder: 6 },
  ]);
}

seedIfEmpty().catch(console.error);

// ─── Addon: Chụp tiệc cưới ───────────────────────────────────────────────────
const ADDONS_TIEC_CUOI = JSON.stringify([
  { key: "ruoc_dau",      name: "Rước dâu",                          price: 500000 },
  { key: "tang_gio",      name: "Tăng giờ chiều / tối",              price: 2000000 },
  { key: "tiec_40_ban",   name: "Tiệc trên 40 bàn",                  price: 500000 },
  { key: "video_hau_truong", name: "Video hậu trường (1-2 phút)",    price: 300000 },
]);

async function seedTiecCuoiIfMissing() {
  const existing = await db.select()
    .from(serviceGroupsTable)
    .where(eq(serviceGroupsTable.name, "CHỤP TIỆC CƯỚI"))
    .limit(1);
  if (existing.length > 0) return;

  // ─── Nhóm 3: CHỤP TIỆC CƯỚI ─────────────────────────────────────────────
  const [grTiec] = await db.insert(serviceGroupsTable).values([
    { name: "CHỤP TIỆC CƯỚI", description: "Gói chụp ảnh phóng sự tiệc cưới", sortOrder: 3 },
  ]).returning();

  const [pkTiec, pkTiecLe, pkPhongSu1, pkPhongSu2] = await db.insert(servicePackagesTable).values([
    {
      groupId: grTiec.id, code: "TC-TRUYEN-THONG", name: "Gói truyền thống (tiệc)",
      price: "3000000", costPrice: "0",
      printCost: "0", operatingCost: "0", salePercent: "10",
      description: "1 photographer — chỉ chụp tiệc, không có lễ",
      serviceType: "tiec", photoCount: 1,
      addons: ADDONS_TIEC_CUOI,
      products: JSON.stringify([
        "200–300 ảnh đã chỉnh màu",
        "File gốc USB / Google Drive",
      ]),
      sortOrder: 1,
    },
    {
      groupId: grTiec.id, code: "TC-TRUYEN-THONG-LE", name: "Gói truyền thống (tiệc + lễ)",
      price: "3500000", costPrice: "0",
      printCost: "0", operatingCost: "0", salePercent: "10",
      description: "1 photographer — chụp cả lễ & tiệc",
      serviceType: "tiec_le", photoCount: 1,
      addons: ADDONS_TIEC_CUOI,
      products: JSON.stringify([
        "300–400 ảnh đã chỉnh màu (lễ + tiệc)",
        "File gốc USB / Google Drive",
      ]),
      sortOrder: 2,
    },
    {
      groupId: grTiec.id, code: "TC-PHONG-SU-1P", name: "Gói phóng sự 1 photo",
      price: "4500000", costPrice: "0",
      printCost: "0", operatingCost: "0", salePercent: "10",
      description: "1 photographer chuyên nghiệp — phong cách phóng sự báo chí",
      serviceType: "phong_su", photoCount: 1,
      addons: ADDONS_TIEC_CUOI,
      products: JSON.stringify([
        "400–500 ảnh phóng sự đã chỉnh màu",
        "20 ảnh retouch kỹ",
        "File gốc USB / Google Drive",
      ]),
      sortOrder: 3,
    },
    {
      groupId: grTiec.id, code: "TC-PHONG-SU-2P", name: "Gói phóng sự 2 photo",
      price: "7000000", costPrice: "0",
      printCost: "0", operatingCost: "0", salePercent: "10",
      description: "2 photographers — phong cách phóng sự — góc chụp toàn diện",
      serviceType: "phong_su_luxury", photoCount: 2,
      addons: ADDONS_TIEC_CUOI,
      products: JSON.stringify([
        "600–800 ảnh phóng sự đã chỉnh màu (2 góc chụp)",
        "30 ảnh retouch kỹ",
        "File gốc USB / Google Drive",
      ]),
      sortOrder: 4,
    },
  ]).returning();

  // Bao gồm — Gói tiệc
  await db.insert(packageItemsTable).values([
    { packageId: pkTiec.id, name: "Nhiếp ảnh gia", quantity: "1", unit: "người", sortOrder: 1 },
    { packageId: pkTiec.id, name: "Chụp tiệc",     quantity: "1", unit: "buổi",  sortOrder: 2 },
  ]);
  // Bao gồm — Gói tiệc + lễ
  await db.insert(packageItemsTable).values([
    { packageId: pkTiecLe.id, name: "Nhiếp ảnh gia",           quantity: "1", unit: "người", sortOrder: 1 },
    { packageId: pkTiecLe.id, name: "Chụp lễ gia tiên / cưới", quantity: "1", unit: "buổi",  sortOrder: 2 },
    { packageId: pkTiecLe.id, name: "Chụp tiệc",               quantity: "1", unit: "buổi",  sortOrder: 3 },
  ]);
  // Bao gồm — Gói phóng sự 1 photo
  await db.insert(packageItemsTable).values([
    { packageId: pkPhongSu1.id, name: "Nhiếp ảnh gia phóng sự", quantity: "1", unit: "người", sortOrder: 1 },
    { packageId: pkPhongSu1.id, name: "Chụp lễ + tiệc",         quantity: "1", unit: "buổi",  sortOrder: 2 },
  ]);
  // Bao gồm — Gói phóng sự 2 photo
  await db.insert(packageItemsTable).values([
    { packageId: pkPhongSu2.id, name: "Nhiếp ảnh gia phóng sự", quantity: "2", unit: "người", notes: "2 góc chụp đồng thời", sortOrder: 1 },
    { packageId: pkPhongSu2.id, name: "Chụp lễ + tiệc",         quantity: "1", unit: "buổi",  sortOrder: 2 },
  ]);

  console.log("[seed] CHỤP TIỆC CƯỚI — 4 gói đã được thêm.");
}

seedTiecCuoiIfMissing().catch(console.error);

// ─── Service groups ─────────────────────────────────────────────────────────
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

// ─── Service packages ────────────────────────────────────────────────────────
router.get("/service-packages", async (_req, res) => {
  const packages = await db.select().from(servicePackagesTable)
    .orderBy(asc(servicePackagesTable.groupId), asc(servicePackagesTable.sortOrder));
  const items = await db.select().from(packageItemsTable)
    .orderBy(asc(packageItemsTable.packageId), asc(packageItemsTable.sortOrder));
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
  const items = await db.select().from(packageItemsTable)
    .where(eq(packageItemsTable.packageId, id)).orderBy(asc(packageItemsTable.sortOrder));
  res.json({ ...fmtPkg(pkg), items });
});

router.post("/service-packages", async (req, res) => {
  const {
    groupId, code, name, price, costPrice, printCost, operatingCost, salePercent,
    description, notes, addons, products, isActive, sortOrder, items = [],
    serviceType, photoCount,
  } = req.body;
  const [pkg] = await db.insert(servicePackagesTable).values({
    groupId: groupId ? parseInt(groupId) : null,
    code, name,
    price: String(price ?? 0),
    costPrice: String(costPrice ?? 0),
    printCost: String(printCost ?? 0),
    operatingCost: String(operatingCost ?? 0),
    salePercent: String(salePercent ?? 0),
    description, notes,
    addons: addons ? (typeof addons === "string" ? addons : JSON.stringify(addons)) : null,
    products: products ? (typeof products === "string" ? products : JSON.stringify(products)) : null,
    isActive: isActive !== false ? 1 : 0,
    sortOrder: sortOrder ?? 0,
    serviceType: serviceType ?? null,
    photoCount: photoCount ? parseInt(photoCount) : 1,
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

  const savedItems = await db.select().from(packageItemsTable)
    .where(eq(packageItemsTable.packageId, pkg.id)).orderBy(asc(packageItemsTable.sortOrder));
  res.status(201).json({ ...fmtPkg(pkg), items: savedItems });
});

router.put("/service-packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    groupId, code, name, price, costPrice, printCost, operatingCost, salePercent,
    description, notes, addons, products, isActive, sortOrder, items,
    serviceType, photoCount,
  } = req.body;

  const update: Record<string, unknown> = {};
  if (groupId !== undefined) update.groupId = groupId ? parseInt(groupId) : null;
  if (code !== undefined) update.code = code;
  if (name !== undefined) update.name = name;
  if (price !== undefined) update.price = String(price);
  if (costPrice !== undefined) update.costPrice = String(costPrice);
  if (printCost !== undefined) update.printCost = String(printCost);
  if (operatingCost !== undefined) update.operatingCost = String(operatingCost);
  if (salePercent !== undefined) update.salePercent = String(salePercent);
  if (description !== undefined) update.description = description;
  if (notes !== undefined) update.notes = notes;
  if (addons !== undefined) update.addons = addons ? (typeof addons === "string" ? addons : JSON.stringify(addons)) : null;
  if (products !== undefined) update.products = products ? (typeof products === "string" ? products : JSON.stringify(products)) : null;
  if (isActive !== undefined) update.isActive = isActive ? 1 : 0;
  if (sortOrder !== undefined) update.sortOrder = sortOrder;
  if (serviceType !== undefined) update.serviceType = serviceType ?? null;
  if (photoCount !== undefined) update.photoCount = photoCount ? parseInt(photoCount) : 1;

  const [pkg] = await db.update(servicePackagesTable).set(update)
    .where(eq(servicePackagesTable.id, id)).returning();
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

  const savedItems = await db.select().from(packageItemsTable)
    .where(eq(packageItemsTable.packageId, id)).orderBy(asc(packageItemsTable.sortOrder));
  res.json({ ...fmtPkg(pkg), items: savedItems });
});

router.delete("/service-packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(packageItemsTable).where(eq(packageItemsTable.packageId, id));
  await db.delete(servicePackagesTable).where(eq(servicePackagesTable.id, id));
  res.status(204).send();
});

// ─── Surcharges ──────────────────────────────────────────────────────────────
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
