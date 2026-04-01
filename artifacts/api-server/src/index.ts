import app from "./app";
import { logger } from "./lib/logger";
import runMigrations from "./migrations";

// Validate GEMINI_API_KEY on startup — required for AI assistant
if (!process.env["GEMINI_API_KEY"]) {
  logger.warn("GEMINI_API_KEY chưa được cấu hình. Vào Replit Secrets và thêm key từ aistudio.google.com/apikey để dùng Trợ lý AI.");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runMigrations()
  .catch((err) => {
    logger.error({ err }, "Migration failed, aborting startup");
    process.exit(1);
  })
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  });
