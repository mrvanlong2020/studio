import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// Rate limiting: 1 request per 3 seconds per user (protect API quota)
const rateLimitMap = new Map<number, number>();
const RATE_LIMIT_MS = 3000;

function checkRateLimit(callerId: number): boolean {
  const now = Date.now();
  const lastCall = rateLimitMap.get(callerId) ?? 0;
  if (now - lastCall < RATE_LIMIT_MS) return false;
  rateLimitMap.set(callerId, now);
  return true;
}

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY_2;
  if (!apiKey) throw new Error("GEMINI_API_KEY chưa được cấu hình");
  return new GoogleGenerativeAI(apiKey);
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

    const revenue = Number((revenueR.rows[0] as Record<string, unknown>)?.total ?? 0);
    const orderCount = Number((ordersR.rows[0] as Record<string, unknown>)?.cnt ?? 0);

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

    return `=== DỮ LIỆU THẬT CỦA AMAZING STUDIO ===
Hôm nay: ${formatDate(todayStr)}

Lịch chụp hôm nay và 3 ngày tới:
${bookingLines}

Doanh thu tháng ${now.getMonth() + 1}/${now.getFullYear()}: ${formatVND(revenue)}
Số đơn hàng tháng này: ${orderCount} đơn

Top 5 khách còn nợ nhiều nhất:
${debtorLines}`;
  } catch (err) {
    console.error("fetchStudioContext error:", err);
    return "(Không lấy được dữ liệu studio)";
  }
}

router.post("/ai/chat", async (req, res) => {
  try {
    const callerId = verifyToken(req.headers.authorization);
    if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập hoặc phiên hết hạn" });

    if (!checkRateLimit(callerId)) {
      return res.status(429).json({ error: "Chờ 3 giây rồi hãy gọi lại." });
    }

    const { messages } = req.body as { messages?: Array<{ role: string; content: string }> };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Thiếu nội dung tin nhắn" });
    }

    const studioContext = await fetchStudioContext();
    const systemInstruction = `Bạn là trợ lý AI của Amazing Studio — studio chụp ảnh cưới và cho thuê váy cưới tại Việt Nam.
Nhiệm vụ: giúp quản lý và nhân viên tra cứu lịch chụp, khách hàng, công nợ, doanh thu, vận hành studio.

Quy tắc:
- Trả lời bằng TIẾNG VIỆT, thân thiện, ngắn gọn, rõ ràng.
- Chỉ dùng dữ liệu bên dưới. KHÔNG bịa số liệu.
- Nếu không có dữ liệu thì nói rõ là chưa có.
- Số tiền dùng định dạng "X.XXX.XXX đ".

${studioContext}`;

    // Build contents array from conversation history
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction,
    });

    // generateContentStream makes the HTTP call at await-time — errors caught by outer try/catch
    const result = await model.generateContentStream({ contents });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    console.error("POST /ai/chat error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota");
    const userMsg = isQuota ? "API quota đã hết. Vui lòng thử lại sau ít phút." : "Lỗi kết nối AI. Vui lòng thử lại.";
    if (!res.headersSent) {
      res.status(isQuota ? 429 : 500).json({ error: userMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
      res.end();
    }
  }
});

export default router;
