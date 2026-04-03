import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/check-ai-key", (_req, res) => {
  res.json({ configured: !!(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY_2"]) });
});

export default router;
