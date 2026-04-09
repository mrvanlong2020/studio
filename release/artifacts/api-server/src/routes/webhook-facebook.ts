import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { crmLeadsTable, settingsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { processIncomingFacebookMessage } from "./fb-inbox";

const router: IRouter = Router();

function ts(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

router.get("/webhook/facebook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];
  let verifyToken = process.env.FB_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN || null;
  if (!verifyToken) {
    try {
      const rows = await db
        .select()
        .from(settingsTable)
        .where(inArray(settingsTable.key, ["fb_verify_token"]))
        .limit(1);
      verifyToken = rows[0]?.value ?? null;
    } catch {}
  }

  if (mode === "subscribe" && (!verifyToken || token === verifyToken)) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/webhook/facebook", async (req, res) => {
  res.status(200).send("OK");

  try {
    const body = req.body;
    if (body?.object !== "page") return;

    // Lấy page ID active từ DB để lọc (chỉ xử lý fanpage đang được cấu hình)
    let activePageId: string | null = null;
    try {
      const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "fb_active_page_id")).limit(1);
      activePageId = rows[0]?.value ?? null;
    } catch { /* ignore */ }

    const entries: unknown[] = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const entryPageId = (entry as Record<string, unknown>).id as string | undefined;
      const messaging: unknown[] = Array.isArray((entry as Record<string, unknown>).messaging)
        ? ((entry as Record<string, unknown>).messaging as unknown[])
        : [];

      for (const event of messaging) {
        const e = event as Record<string, unknown>;
        const sender = e.sender as Record<string, unknown> | undefined;
        const recipient = e.recipient as Record<string, unknown> | undefined;
        const msg = e.message as Record<string, unknown> | undefined;
        const recipientPageId = recipient?.id as string | undefined;
        const eventPageId = entryPageId || recipientPageId;

        if (activePageId && eventPageId !== activePageId) {
          console.log(
            `[Webhook][${ts()}] Skip event page=${eventPageId ?? "unknown"} (active=${activePageId}, entry=${entryPageId ?? "unknown"}, recipient=${recipientPageId ?? "unknown"})`,
          );
          continue;
        }

        const psid: string | undefined = sender?.id as string | undefined;
        const text: string | undefined = msg?.text as string | undefined;

        if (!psid || !text) {
          console.log(`[CRM][${ts()}] Skip non-text message (psid=${psid ?? "unknown"})`);
          continue;
        }

        const existing = await db
          .select()
          .from(crmLeadsTable)
          .where(eq(crmLeadsTable.facebookUserId, psid))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(crmLeadsTable)
            .set({
              lastMessage: text,
              lastMessageAt: new Date(),
            })
            .where(eq(crmLeadsTable.facebookUserId, psid));
          console.log(`[CRM][${ts()}] Updated lead #${existing[0].id} (psid=${psid}): ${text.slice(0, 50)}`);
        } else {
          const [newLead] = await db
            .insert(crmLeadsTable)
            .values({
              name: "Khách Facebook " + psid.slice(-4),
              phone: null,
              facebookUserId: psid,
              lastMessage: text,
              lastMessageAt: new Date(),
              source: "facebook",
              type: "unknown",
              channel: "inbox",
              status: "new",
            })
            .returning();
          console.log(`[CRM][${ts()}] Created lead #${newLead.id} (psid=${psid}): ${text.slice(0, 50)}`);
        }

        processIncomingFacebookMessage(psid, text).catch((err) => {
          console.error("[CRM] processIncomingFacebookMessage error:", err);
        });
      }
    }
  } catch (err) {
    console.error("[CRM] Webhook processing error:", err);
  }
});

export default router;
