import app from "./app";
import { logger } from "./lib/logger";
import runMigrations from "./migrations";

// Validate GEMINI_API_KEY on startup — required for AI assistant
if (!process.env["GEMINI_API_KEY"] && !process.env["GOOGLE_API_KEY_2"]) {
  logger.warn("GEMINI_API_KEY chưa được cấu hình. Vào Replit Secrets và thêm key từ aistudio.google.com/apikey để dùng Trợ lý AI.");
}

const rawPort = Number(process.env.PORT);
const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 3000;

runMigrations()
  .catch((err) => {
    logger.error({ err }, "Migration failed, aborting startup");
    process.exit(1);
  })
  .then(() => {
    const server = app.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });

    const shutdown = () => server.close(() => process.exit(0));
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  });
