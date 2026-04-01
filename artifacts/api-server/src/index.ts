import app from "./app";
import { logger } from "./lib/logger";
import runMigrations from "./migrations";

// Prevent unhandled promise rejections (e.g. from streaming SDK errors) from crashing the process
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "[unhandledRejection] Caught unhandled rejection — server will not crash");
});

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
