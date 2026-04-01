import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// Model priority list — gemini-2.0-flash first per spec, fall back if quota exceeded
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY chưa được cấu hình");
  return apiKey;
}

async function fetchStudioContext(): Promise<string> {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const bookingsR = await pool.query(
      `SELECT b.shoot_date, b.shoot_time, b.status, b.package_type, b.location,
              c.name AS customer_name, c.phone AS customer_phone
       FROM bookings b
       LEFT JOIN customers c ON c.id = b.customer_id
       WHERE b.shoot_date BETWEEN $1 AND $2 AND b.status != 'cancelled'
         AND (b.parent_id IS NULL OR b.is_parent_contract = true)
       ORDER BY b.shoot_date, b.shoot_time
       LIMIT 20`,
      [todayStr, in3Days]
    );

    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const revenueR = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE paid_at >= $1 AND paid_at <= $2`,
      [monthStart, monthEnd]
    );

    const ordersR = await pool.query(
      `SELECT COUNT(*) AS cnt FROM bookings WHERE shoot_date >= $1 AND shoot_date <= $2 AND status != 'cancelled'`,
      [monthStart, monthEnd]
    );

    const debtorsR = await pool.query(
      `SELECT c.name, c.phone,
              SUM(GREATEST(0, CAST(b.total_amount AS numeric) - CAST(b.discount_amount AS numeric) - CAST(b.paid_amount AS numeric))) AS debt
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.status != 'cancelled'
       GROUP BY c.id, c.name, c.phone
       HAVING SUM(GREATEST(0, CAST(b.total_amount AS numeric) - CAST(b.discount_amount AS numeric) - CAST(b.paid_amount AS numeric))) > 0
       ORDER BY debt DESC
       LIMIT 5`
    );

    const custR = await pool.query(`SELECT COUNT(*) AS cnt FROM customers`);

    const revenue = Number((revenueR.rows[0] as Record<string, unknown>)?.total ?? 0);
    const orderCount = Number((ordersR.rows[0] as Record<string, unknown>)?.cnt ?? 0);
    const customerCount = Number((custR.rows[0] as Record<string, unknown>)?.cnt ?? 0);

    const formatVND = (n: number) => n.toLocaleString("vi-VN") + " đ";
    const formatDate = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
    };
    const statusMap: Record<string, string> = {
      pending: "Chờ xử lý", confirmed: "Đã xác nhận", shooting: "Đang chụp",
      editing: "Đang hậu kỳ", completed: "Hoàn thành", cancelled: "Đã huỷ"
    };

    const bookingLines = (bookingsR.rows as Record<string, unknown>[]).map(b => {
      const time = b.shoot_time ? ` lúc ${b.shoot_time}` : "";
      const loc = b.location ? ` tại ${b.location}` : "";
      const status = statusMap[b.status as string] ?? (b.status as string);
      return `  - ${formatDate(b.shoot_date as string)}${time}: ${b.customer_name} (${b.customer_phone}) — ${b.package_type}${loc} [${status}]`;
    }).join("\n") || "  (Không có lịch chụp nào)";

    const debtorLines = (debtorsR.rows as Record<string, unknown>[]).map(d =>
      `  - ${d.name} (${d.phone}): còn nợ ${formatVND(Number(d.debt))}`
    ).join("\n") || "  (Không có khách nợ tiền)";

    return `
=== DỮ LIỆU THẬT CỦA AMAZING STUDIO (cập nhật ngay lúc hỏi) ===
📅 Hôm nay: ${formatDate(todayStr)}

🗓️ Lịch chụp hôm nay và 3 ngày tới:
${bookingLines}

💰 Doanh thu tháng ${now.getMonth() + 1}/${now.getFullYear()}: ${formatVND(revenue)}
📋 Số đơn hàng tháng này: ${orderCount} đơn
👥 Tổng số khách hàng: ${customerCount} khách

💳 Top 5 khách còn nợ nhiều nhất:
${debtorLines}
`;
  } catch (err) {
    console.error("fetchStudioContext error:", err);
    return "(Không lấy được dữ liệu studio)";
  }
}

type GeminiContent = { role: string; parts: Array<{ text: string }> };

async function callGeminiStream(
  apiKey: string,
  model: string,
  systemInstruction: string,
  history: GeminiContent[],
  userMessage: string
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [...history, { role: "user", parts: [{ text: userMessage }] }],
    generationConfig: { maxOutputTokens: 2048 },
  };
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

router.post("/ai/chat", async (req, res) => {
  try {
    const callerId = verifyToken(req.headers.authorization);
    if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập hoặc phiên hết hạn" });

    const { messages } = req.body as { messages?: Array<{ role: string; content: string }> };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Thiếu nội dung tin nhắn" });
    }

    const apiKey = getApiKey();
    const studioContext = await fetchStudioContext();

    const systemInstruction = `Bạn là trợ lý AI của Amazing Studio — một studio chụp ảnh cưới và cho thuê váy cưới tại Việt Nam.
Nhiệm vụ: giúp quản lý và nhân viên tra cứu thông tin nhanh về lịch chụp, khách hàng, công nợ, doanh thu, vận hành studio.

Quy tắc:
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện, ngắn gọn, rõ ràng.
- Chỉ dùng dữ liệu được cung cấp bên dưới. KHÔNG bịa số liệu.
- Nếu không có thông tin, nói thẳng "Hệ thống không có dữ liệu về điều này".
- Khi nêu số tiền, dùng định dạng "X.XXX.XXX đ" hoặc "X triệu đ".

${studioContext}`;

    const history: GeminiContent[] = messages.slice(0, -1).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const lastMsg = messages[messages.length - 1];

    // Try each model in order, fall back if quota exceeded
    let geminiResponse: Response | null = null;
    let usedModel = GEMINI_MODELS[0];

    for (let i = 0; i < GEMINI_MODELS.length; i++) {
      const model = GEMINI_MODELS[i];
      const r = await callGeminiStream(apiKey, model, systemInstruction, history, lastMsg.content);
      if (r.status === 429 && i < GEMINI_MODELS.length - 1) {
        console.warn(`[ai] Model ${model} quota exceeded (429), falling back to ${GEMINI_MODELS[i + 1]}`);
        continue;
      }
      geminiResponse = r;
      usedModel = model;
      break;
    }

    if (!geminiResponse) {
      return res.status(429).json({ error: "API quota đã hết. Vui lòng thử lại sau ít phút." });
    }

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text().catch(() => "");
      console.error(`[ai] Gemini error ${geminiResponse.status} (${usedModel}):`, errText);
      return res.status(500).json({ error: "Lỗi kết nối AI. Vui lòng thử lại." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = geminiResponse.body?.getReader();
    if (!reader) {
      return res.status(500).json({ error: "Không nhận được stream từ AI" });
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
          if (!candidates?.length) continue;
          const parts = (candidates[0].content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
          if (!parts?.length) continue;
          const text = parts[0].text as string | undefined;
          if (text) {
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        } catch { /* skip malformed chunk */ }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    console.error("POST /ai/chat error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    const isQuota = errMsg.includes("429") || errMsg.toLowerCase().includes("quota");
    const userMsg = isQuota
      ? "API quota đã hết. Vui lòng thử lại sau ít phút."
      : "Lỗi kết nối AI. Vui lòng thử lại.";
    if (!res.headersSent) {
      res.status(500).json({ error: userMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
      res.end();
    }
  }
});

export default router;
