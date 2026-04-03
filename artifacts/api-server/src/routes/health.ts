import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/check-ai-key", async (_req, res) => {
  let configured = !!process.env["GEMINI_API_KEY"];
  if (!configured) {
    try {
      const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "gemini_api_key"));
      configured = !!(rows[0]?.value);
    } catch {}
  }
  res.json({ configured });
});

export default router;
