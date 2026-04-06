import { pool } from "@workspace/db";

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS notes TEXT`);
    await client.query(`ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL`);

    await client.query(`ALTER TABLE photoshop_jobs ADD COLUMN IF NOT EXISTS photoshop_note text DEFAULT ''`);
    await client.query(`ALTER TABLE photoshop_jobs ADD COLUMN IF NOT EXISTS extra_retouch_price integer DEFAULT 0`);

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
