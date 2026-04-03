import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { verifyToken } from "./auth";
import { pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router: IRouter = Router();

const DEFAULT_SETTINGS = {
  studioName: "Amazing Studio",
  phone: "0901234567",
  email: "contact@amazingstudio.vn",
  address: "123 Đường Lê Lợi, Q1, TP.HCM",
  taxCode: null,
  bankAccount: null,
  bankName: null,
  logoUrl: null,
  workingHours: "08:00 - 18:00",
  defaultDeposit: 30,
  studio_lat: 11.3101,
  studio_lng: 106.1074,
  attendance_radius_m: 300,
};

async function loadSettings() {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    studioName: map["studioName"] ?? DEFAULT_SETTINGS.studioName,
    phone: map["phone"] ?? DEFAULT_SETTINGS.phone,
    email: map["email"] ?? DEFAULT_SETTINGS.email,
    address: map["address"] ?? DEFAULT_SETTINGS.address,
    taxCode: map["taxCode"] ?? DEFAULT_SETTINGS.taxCode,
    bankAccount: map["bankAccount"] ?? DEFAULT_SETTINGS.bankAccount,
    bankName: map["bankName"] ?? DEFAULT_SETTINGS.bankName,
    logoUrl: map["logoUrl"] ?? DEFAULT_SETTINGS.logoUrl,
    workingHours: map["workingHours"] ?? DEFAULT_SETTINGS.workingHours,
    defaultDeposit: parseFloat(map["defaultDeposit"] ?? String(DEFAULT_SETTINGS.defaultDeposit)),
    studio_lat: parseFloat(map["studio_lat"] ?? String(DEFAULT_SETTINGS.studio_lat)),
    studio_lng: parseFloat(map["studio_lng"] ?? String(DEFAULT_SETTINGS.studio_lng)),
    attendance_radius_m: parseFloat(map["attendance_radius_m"] ?? String(DEFAULT_SETTINGS.attendance_radius_m)),
  };
}

async function isAdminCaller(authorization: string | undefined): Promise<boolean> {
  const callerId = verifyToken(authorization);
  if (!callerId) return false;
  const r = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = r.rows[0] as Record<string, unknown> | undefined;
  return !!(caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin"))));
}

router.get("/settings", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json(await loadSettings());
});

router.put("/settings", async (req, res) => {
  if (!await isAdminCaller(req.headers.authorization)) {
    return res.status(403).json({ error: "Không có quyền" });
  }
  const settings = req.body as Record<string, unknown>;
  for (const [key, value] of Object.entries(settings)) {
    if (value === null || value === undefined) continue;
    await db
      .insert(settingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(value) } });
  }
  res.json(await loadSettings());
});

// ---------- AI Key helpers ----------
async function getGeminiApiKey(): Promise<string | null> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "gemini_api_key"));
    if (rows[0]?.value) return rows[0].value;
  } catch {}
  return process.env.GEMINI_API_KEY || null;
}

// GET /settings/ai-key/status — configured true/false (không trả key)
router.get("/settings/ai-key/status", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const key = await getGeminiApiKey();
  res.json({ configured: !!key });
});

// PUT /settings/ai-key — lưu key vào DB (admin only)
router.put("/settings/ai-key", async (req, res) => {
  if (!await isAdminCaller(req.headers.authorization)) {
    return res.status(403).json({ error: "Không có quyền" });
  }
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(400).json({ error: "API key không hợp lệ" });
  }
  await db
    .insert(settingsTable)
    .values({ key: "gemini_api_key", value: apiKey.trim() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: apiKey.trim() } });
  res.json({ ok: true });
});

// POST /settings/ai-key/test — test key đã lưu trong DB (admin only)
router.post("/settings/ai-key/test", async (req, res) => {
  if (!await isAdminCaller(req.headers.authorization)) {
    return res.status(403).json({ error: "Không có quyền" });
  }
  const apiKey = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "gemini_api_key"));
  const dbKey = apiKey[0]?.value?.trim() || "";
  if (!dbKey) return res.json({ ok: false, message: "Chưa có API key trong database" });
  try {
    const genAI = new GoogleGenerativeAI(dbKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    await model.generateContent("Trả lời đúng 1 chữ: OK");
    res.json({ ok: true, message: "Kết nối Gemini thành công!" });
  } catch (e) {
    res.json({ ok: false, message: "Key không hợp lệ hoặc lỗi mạng: " + String(e) });
  }
});

export default router;
