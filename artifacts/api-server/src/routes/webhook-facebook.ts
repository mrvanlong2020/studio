import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { crmLeadsTable, settingsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { processIncomingFacebookMessage } from "./fb-inbox";
import { logWebhookEvent as logEvent } from "./webhook-log";

const router: IRouter = Router();

function ts(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

async function getPageAccessToken(): Promise<string | null> {
  const envToken = process.env.FB_PAGE_ACCESS_TOKEN ?? null;
  if (envToken) return envToken;
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "fb_page_access_token")).limit(1);
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function fetchFacebookProfile(psid: string, pageAccessToken: string): Promise<{ name: string; avatarUrl: string | null }> {
  try {
    const url = `https://graph.facebook.com/${psid}?fields=name,profile_pic&access_token=${pageAccessToken}`;
    const res = await fetch(url);
    if (!res.ok) return { name: "Khách Facebook " + psid.slice(-4), avatarUrl: null };
    const data = await res.json() as { name?: string; profile_pic?: string };
    return {
      name: data.name || "Khách Facebook " + psid.slice(-4),
      avatarUrl: data.profile_pic || null,
    };
  } catch {
    return { name: "Khách Facebook " + psid.slice(-4), avatarUrl: null };
  }
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
    logEvent({ at: new Date().toISOString(), type: "verification", summary: `✅ Verification OK — challenge returned` });
    console.log(`[Webhook][${ts()}] ✅ Verification challenge OK`);
    return res.status(200).send(challenge);
  }

  logEvent({ at: new Date().toISOString(), type: "error", summary: `❌ Verification FAILED — token mismatch (got: ${token}, expected: ${verifyToken ?? "(not set)"})` });
  console.warn(`[Webhook][${ts()}] ❌ Verification FAILED — token mismatch`);
  return res.sendStatus(403);
});

router.post("/webhook/facebook", async (req, res) => {
  res.status(200).send("OK");

  try {
    const body = req.body;
    console.log(`[Webhook][${ts()}] POST received — object=${body?.object ?? "unknown"}, entries=${Array.isArray(body?.entry) ? body.entry.length : 0}`);
    logEvent({ at: new Date().toISOString(), type: "other", summary: `📩 POST received — object=${body?.object ?? "?"}`, raw: body });

    if (body?.object !== "page") {
      logEvent({ at: new Date().toISOString(), type: "other", summary: `⚠️ Non-page object: ${body?.object}` });
      return;
    }

    const entries: unknown[] = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const messaging: unknown[] = Array.isArray((entry as Record<string, unknown>).messaging)
        ? ((entry as Record<string, unknown>).messaging as unknown[])
        : [];

      for (const event of messaging) {
        const e = event as Record<string, unknown>;
        const sender = e.sender as Record<string, unknown> | undefined;
        const msg = e.message as Record<string, unknown> | undefined;

        const psid: string | undefined = sender?.id as string | undefined;
        const text: string | undefined = msg?.text as string | undefined;

        if (!psid || !text) {
          const msgType = msg ? (msg.attachments ? "attachment" : "no-text") : "no-msg";
          logEvent({ at: new Date().toISOString(), type: "other", summary: `⚠️ Skip — ${msgType} (psid=${psid ?? "?"}), event keys: ${Object.keys(e).join(",")}`, psid });
          console.log(`[CRM][${ts()}] Skip non-text message (psid=${psid ?? "unknown"})`);
          continue;
        }

        logEvent({ at: new Date().toISOString(), type: "message", summary: `💬 [${psid}] "${text.slice(0, 60)}"`, psid });

        const existing = await db
          .select()
          .from(crmLeadsTable)
          .where(eq(crmLeadsTable.facebookUserId, psid))
          .limit(1);

        if (existing.length > 0) {
          const lead = existing[0];
          const updateData: Record<string, unknown> = { lastMessage: text, lastMessageAt: new Date() };
          if (!lead.avatarUrl || lead.name.startsWith("Khách Facebook ")) {
            const token = await getPageAccessToken();
            if (token) {
              const profile = await fetchFacebookProfile(psid, token);
              if (lead.name.startsWith("Khách Facebook ")) updateData.name = profile.name;
              if (!lead.avatarUrl && profile.avatarUrl) updateData.avatarUrl = profile.avatarUrl;
            }
          }
          await db.update(crmLeadsTable).set(updateData).where(eq(crmLeadsTable.facebookUserId, psid));
          console.log(`[CRM][${ts()}] Updated lead #${lead.id} (psid=${psid}): ${text.slice(0, 50)}`);
        } else {
          const token = await getPageAccessToken();
          const profile = token
            ? await fetchFacebookProfile(psid, token)
            : { name: "Khách Facebook " + psid.slice(-4), avatarUrl: null };
          const [newLead] = await db
            .insert(crmLeadsTable)
            .values({
              name: profile.name,
              avatarUrl: profile.avatarUrl,
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
          console.log(`[CRM][${ts()}] Created lead #${newLead.id} "${profile.name}" (psid=${psid}): ${text.slice(0, 50)}`);
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
