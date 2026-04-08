import { Router, type IRouter } from "express";
import type { Request } from "express";
import { db, pool } from "@workspace/db";
import { crmLeadsTable, settingsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { verifyToken } from "./auth";

const router: IRouter = Router();

type FbConfig = {
  pageAccessToken: string | null;
  verifyToken: string | null;
  autoReplyEnabled: boolean;
  openaiApiKey: string | null;
};

async function ensureFbInboxTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_inbox_messages (
      id SERIAL PRIMARY KEY,
      facebook_user_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
      message TEXT NOT NULL,
      sent_status TEXT NOT NULL DEFAULT 'received',
      ai_decision TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fb_inbox_user_created
    ON fb_inbox_messages (facebook_user_id, created_at DESC)
  `);
}
ensureFbInboxTable().catch((err) => console.error("ensureFbInboxTable error:", err));

function toBool(v: string | null | undefined): boolean {
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

async function getConfig(): Promise<FbConfig> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(
      inArray(settingsTable.key, [
        "fb_page_access_token",
        "fb_verify_token",
        "fb_auto_reply_enabled",
        "openai_api_key",
      ]),
    );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    pageAccessToken: map.get("fb_page_access_token") ?? process.env.FB_PAGE_ACCESS_TOKEN ?? null,
    verifyToken: map.get("fb_verify_token") ?? process.env.FB_VERIFY_TOKEN ?? null,
    autoReplyEnabled: toBool(map.get("fb_auto_reply_enabled") ?? process.env.FB_AUTO_REPLY_ENABLED),
    openaiApiKey: map.get("openai_api_key") ?? process.env.OPENAI_API_KEY ?? null,
  };
}

async function getCaller(req: Request) {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return null;
  const r = await pool.query(`SELECT id, role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = r.rows[0] as { id: number; role?: string; roles?: string[] } | undefined;
  if (!caller) return null;
  return caller;
}

function isAdmin(caller: { role?: string; roles?: string[] } | null): boolean {
  if (!caller) return false;
  return caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin"));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendFacebookMessage(psid: string, text: string, pageAccessToken: string) {
  const r = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Facebook send failed: ${r.status} ${errText}`);
  }
}

async function buildStudioContext(): Promise<string> {
  const lines: string[] = [];

  // Bảng giá / thông tin studio tùy chỉnh từ Admin (ưu tiên cao nhất)
  try {
    const settingRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "aiPricingInfo")).limit(1);
    const aiPricingInfo = settingRows[0]?.value?.trim();
    if (aiPricingInfo) {
      lines.push("=== THÔNG TIN BẢNG GIÁ / DỊCH VỤ STUDIO ===");
      lines.push(aiPricingInfo);
      lines.push("=== HẾT THÔNG TIN BẢNG GIÁ ===");
      lines.push("");
    }
  } catch { /* bỏ qua */ }

  try {
    const services = await pool.query(`
      SELECT name, code, price, description
      FROM services
      WHERE is_active = 1
      ORDER BY id ASC
      LIMIT 30
    `);
    const serviceLines = (services.rows as Array<{ name: string; code: string; price: string; description: string | null }>).map(
      (s) => `- ${s.name}${s.code ? ` (${s.code})` : ""}: ${Number(s.price || 0).toLocaleString("vi-VN")} đ${s.description ? ` — ${s.description}` : ""}`,
    );
    lines.push("Dịch vụ / gói chụp trong hệ thống:", ...(serviceLines.length ? serviceLines : ["- Chưa có dữ liệu dịch vụ"]));
  } catch {
    lines.push("Dịch vụ: chưa lấy được dữ liệu.");
  }

  try {
    const now = new Date();
    const to = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const fromStr = now.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const bookings = await pool.query(
      `
      SELECT b.shoot_date, b.shoot_time, b.package_type, b.status, c.name AS customer_name
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      WHERE b.shoot_date BETWEEN $1 AND $2
        AND b.status != 'cancelled'
      ORDER BY b.shoot_date, b.shoot_time
      LIMIT 10
      `,
      [fromStr, toStr],
    );
    const bookingLines = (bookings.rows as Array<{ shoot_date: string; shoot_time: string; package_type: string; status: string; customer_name: string }>).map(
      (b) => `- ${b.shoot_date} ${b.shoot_time ?? ""}: ${b.customer_name ?? "Khách"} - ${b.package_type ?? "Gói chưa rõ"} [${b.status}]`,
    );
    lines.push("", "Lịch chụp 7 ngày tới:", ...(bookingLines.length ? bookingLines : ["- Chưa có lịch chụp sắp tới"]));
  } catch {
    lines.push("", "Lịch chụp 7 ngày tới: chưa lấy được dữ liệu.");
  }

  return lines.join("\n");
}

async function askChatGptForReply(input: {
  apiKey: string;
  customerMessage: string;
  customerName: string;
  history: Array<{ direction: "incoming" | "outgoing"; message: string }>;
}): Promise<{ inScope: boolean; reply: string; reason: string }> {
  const context = await buildStudioContext();
  const historyText = input.history
    .slice(-8)
    .map((m) => `${m.direction === "incoming" ? "Khách" : "Studio"}: ${m.message}`)
    .join("\n");

  const prompt = `
Bạn là AI CSKH của studio ảnh cưới.
Mục tiêu:
- Chỉ trả lời các câu cơ bản, phổ biến: báo giá, gói dịch vụ, lịch chụp, thông tin chung, chính sách cơ bản.
- Nếu câu hỏi mơ hồ, nhạy cảm, ngoài dữ liệu hoặc cần xác nhận thủ công -> KHÔNG tự trả lời.

Trả về JSON duy nhất theo schema:
{"inScope": boolean, "reply": string, "reason": string}

Quy tắc:
- Nếu ngoài phạm vi: inScope=false, reply="".
- Nếu trong phạm vi: inScope=true, reply ngắn gọn, lịch sự, tiếng Việt, tối đa 5 câu, không bịa dữ liệu.

Tên khách: ${input.customerName}

Lịch sử gần đây:
${historyText || "(chưa có)"}

Tin nhắn mới từ khách:
${input.customerMessage}

Ngữ cảnh dữ liệu app:
${context}
`.trim();

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Bạn trả về JSON hợp lệ, không thêm markdown." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${err}`);
  }

  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { inScope?: boolean; reply?: string; reason?: string } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { inScope: false, reply: "", reason: "Phản hồi AI không đúng định dạng JSON" };
  }
  return {
    inScope: !!parsed.inScope && !!parsed.reply,
    reply: parsed.reply?.trim() ?? "",
    reason: parsed.reason?.trim() ?? "",
  };
}

export async function processIncomingFacebookMessage(psid: string, text: string) {
  await ensureFbInboxTable();
  await pool.query(
    `
    INSERT INTO fb_inbox_messages (facebook_user_id, direction, message, sent_status)
    VALUES ($1, 'incoming', $2, 'received')
    `,
    [psid, text],
  );

  const cfg = await getConfig();
  if (!cfg.autoReplyEnabled || !cfg.openaiApiKey || !cfg.pageAccessToken) {
    await pool.query(
      `
      UPDATE fb_inbox_messages
      SET ai_decision = $1
      WHERE id = (
        SELECT id FROM fb_inbox_messages
        WHERE facebook_user_id = $2 AND direction = 'incoming'
        ORDER BY id DESC
        LIMIT 1
      )
      `,
      ["disabled_or_missing_config", psid],
    );
    return;
  }

  const leadRows = await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.facebookUserId, psid)).limit(1);
  const lead = leadRows[0];
  const historyRows = await pool.query(
    `
    SELECT direction, message
    FROM fb_inbox_messages
    WHERE facebook_user_id = $1
    ORDER BY id DESC
    LIMIT 20
    `,
    [psid],
  );

  let ai;
  try {
    ai = await askChatGptForReply({
      apiKey: cfg.openaiApiKey,
      customerMessage: text,
      customerName: lead?.name ?? `Khách ${psid.slice(-4)}`,
      history: (historyRows.rows as Array<{ direction: "incoming" | "outgoing"; message: string }>).reverse(),
    });
  } catch (err) {
    await pool.query(
      `UPDATE fb_inbox_messages
       SET ai_decision = $1
       WHERE id = (
         SELECT id FROM fb_inbox_messages
         WHERE facebook_user_id = $2 AND direction = 'incoming'
         ORDER BY id DESC LIMIT 1
       )`,
      [`ai_error:${String(err)}`, psid],
    );
    return;
  }

  if (!ai.inScope || !ai.reply) {
    await pool.query(
      `UPDATE fb_inbox_messages
       SET ai_decision = $1
       WHERE id = (
         SELECT id FROM fb_inbox_messages
         WHERE facebook_user_id = $2 AND direction = 'incoming'
         ORDER BY id DESC LIMIT 1
       )`,
      [`out_of_scope:${ai.reason || "unknown"}`, psid],
    );
    return;
  }

  await sleep(3000 + Math.floor(Math.random() * 1000));
  try {
    await sendFacebookMessage(psid, ai.reply, cfg.pageAccessToken);
    await pool.query(
      `
      INSERT INTO fb_inbox_messages (facebook_user_id, direction, message, sent_status, ai_decision)
      VALUES ($1, 'outgoing', $2, 'sent', $3)
      `,
      [psid, ai.reply, "auto_replied"],
    );
  } catch (err) {
    await pool.query(
      `
      INSERT INTO fb_inbox_messages (facebook_user_id, direction, message, sent_status, ai_decision)
      VALUES ($1, 'outgoing', $2, 'failed', $3)
      `,
      [psid, ai.reply, `auto_send_failed:${String(err)}`],
    );
  }
}

function maskToken(t: string | null): string | null {
  if (!t || t.length < 8) return t ? "****" : null;
  return t.slice(0, 4) + "****" + t.slice(-4);
}

router.get("/fb-ai/config", async (req, res) => {
  const caller = await getCaller(req);
  if (!isAdmin(caller)) return res.status(403).json({ error: "Chỉ admin mới xem cấu hình" });
  const cfg = await getConfig();
  res.json({
    hasPageAccessToken: !!cfg.pageAccessToken,
    hasOpenAiKey: !!cfg.openaiApiKey,
    hasVerifyToken: !!cfg.verifyToken,
    autoReplyEnabled: cfg.autoReplyEnabled,
    pageAccessTokenHint: maskToken(cfg.pageAccessToken),
    openAiKeyHint: maskToken(cfg.openaiApiKey),
    verifyTokenHint: maskToken(cfg.verifyToken),
  });
});

router.put("/fb-ai/config", async (req, res) => {
  const caller = await getCaller(req);
  if (!isAdmin(caller)) return res.status(403).json({ error: "Chỉ admin mới sửa cấu hình" });

  const {
    pageAccessToken,
    verifyToken,
    openaiApiKey,
    autoReplyEnabled,
  } = req.body as {
    pageAccessToken?: string;
    verifyToken?: string;
    openaiApiKey?: string;
    autoReplyEnabled?: boolean;
  };

  const updates: Array<[string, string]> = [];
  if (pageAccessToken !== undefined) updates.push(["fb_page_access_token", pageAccessToken.trim()]);
  if (verifyToken !== undefined) updates.push(["fb_verify_token", verifyToken.trim()]);
  if (openaiApiKey !== undefined) updates.push(["openai_api_key", openaiApiKey.trim()]);
  if (autoReplyEnabled !== undefined) updates.push(["fb_auto_reply_enabled", autoReplyEnabled ? "true" : "false"]);

  for (const [key, value] of updates) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value },
      });
  }
  res.json({ success: true });
});

router.get("/fb-inbox/threads", async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: "Chưa đăng nhập" });

  const q = await pool.query(`
    SELECT
      m.facebook_user_id,
      MAX(m.created_at) AS last_at,
      (ARRAY_AGG(m.message ORDER BY m.created_at DESC))[1] AS last_message,
      (ARRAY_AGG(m.direction ORDER BY m.created_at DESC))[1] AS last_direction,
      (ARRAY_AGG(m.ai_decision ORDER BY m.created_at DESC))[1] AS last_ai_decision
    FROM fb_inbox_messages m
    GROUP BY m.facebook_user_id
    ORDER BY MAX(m.created_at) DESC
    LIMIT 200
  `);

  const psids = (q.rows as Array<{ facebook_user_id: string }>).map((r) => r.facebook_user_id);
  let leadsByPsid = new Map<string, { name: string; phone: string | null; status: string | null; avatarUrl: string | null }>();
  if (psids.length > 0) {
    const leads = await db
      .select({
        facebookUserId: crmLeadsTable.facebookUserId,
        name: crmLeadsTable.name,
        phone: crmLeadsTable.phone,
        status: crmLeadsTable.status,
        avatarUrl: crmLeadsTable.avatarUrl,
      })
      .from(crmLeadsTable)
      .where(inArray(crmLeadsTable.facebookUserId, psids));
    leadsByPsid = new Map(
      leads
        .filter((x) => !!x.facebookUserId)
        .map((x) => [x.facebookUserId as string, { name: x.name, phone: x.phone, status: x.status, avatarUrl: x.avatarUrl ?? null }]),
    );
  }

  res.json(
    (q.rows as Array<{
      facebook_user_id: string;
      last_at: string;
      last_message: string;
      last_direction: "incoming" | "outgoing";
      last_ai_decision: string | null;
    }>).map((r) => ({
      psid: r.facebook_user_id,
      lastAt: r.last_at,
      lastMessage: r.last_message,
      lastDirection: r.last_direction,
      lastAiDecision: r.last_ai_decision,
      lead: leadsByPsid.get(r.facebook_user_id) ?? null,
    })),
  );
});

router.get("/fb-inbox/threads/:psid/messages", async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: "Chưa đăng nhập" });
  const { psid } = req.params;
  const r = await pool.query(
    `
    SELECT id, direction, message, sent_status, ai_decision, created_at
    FROM fb_inbox_messages
    WHERE facebook_user_id = $1
    ORDER BY created_at ASC
    LIMIT 500
    `,
    [psid],
  );
  res.json(r.rows);
});

router.post("/fb-inbox/threads/:psid/suggest", async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: "Chưa đăng nhập" });
  const { psid } = req.params;
  const cfg = await getConfig();
  if (!cfg.openaiApiKey) return res.status(400).json({ error: "Chưa cấu hình OpenAI API key" });

  const historyRows = await pool.query(
    `SELECT direction, message FROM fb_inbox_messages WHERE facebook_user_id = $1 ORDER BY id DESC LIMIT 30`,
    [psid],
  );
  const latestIncoming = (historyRows.rows as Array<{ direction: "incoming" | "outgoing"; message: string }>).find(
    (m) => m.direction === "incoming",
  );
  if (!latestIncoming) return res.status(400).json({ error: "Chưa có tin nhắn từ khách để gợi ý" });

  const leadRows = await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.facebookUserId, psid)).limit(1);
  const lead = leadRows[0];
  const ai = await askChatGptForReply({
    apiKey: cfg.openaiApiKey,
    customerMessage: latestIncoming.message,
    customerName: lead?.name ?? `Khách ${psid.slice(-4)}`,
    history: (historyRows.rows as Array<{ direction: "incoming" | "outgoing"; message: string }>).reverse(),
  });
  res.json(ai);
});

router.post("/fb-inbox/threads/:psid/send", async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: "Chưa đăng nhập" });
  const { psid } = req.params;
  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) return res.status(400).json({ error: "Thiếu nội dung gửi" });

  const cfg = await getConfig();
  if (!cfg.pageAccessToken) return res.status(400).json({ error: "Chưa cấu hình Facebook Page Access Token" });

  const msg = text.trim();
  await sleep(3000 + Math.floor(Math.random() * 1000));
  try {
    await sendFacebookMessage(psid, msg, cfg.pageAccessToken);
    await pool.query(
      `
      INSERT INTO fb_inbox_messages (facebook_user_id, direction, message, sent_status, ai_decision)
      VALUES ($1, 'outgoing', $2, 'sent', 'manual_sent')
      `,
      [psid, msg],
    );
    res.json({ success: true });
  } catch (err) {
    await pool.query(
      `
      INSERT INTO fb_inbox_messages (facebook_user_id, direction, message, sent_status, ai_decision)
      VALUES ($1, 'outgoing', $2, 'failed', $3)
      `,
      [psid, msg, `manual_send_failed:${String(err)}`],
    );
    res.status(500).json({ error: "Gửi Facebook thất bại", detail: String(err) });
  }
});

router.get("/fb-ai/service-context", async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: "Chưa đăng nhập" });
  const ctx = await buildStudioContext();
  res.json({ context: ctx });
});

export default router;
