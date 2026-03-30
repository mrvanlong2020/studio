import { pool } from "@workspace/db";

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS notes TEXT`);

    await client.query("COMMIT");
    console.log("[migrations] Hoàn thành.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[migrations] Lỗi:", err);
    throw err;
  } finally {
    client.release();
  }
}

export default runMigrations;
