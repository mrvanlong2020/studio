import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

async function ensurePasswordColumn() {
  await pool.query(`
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash TEXT
  `).catch(() => {});
  const r = await pool.query(`
    SELECT id, phone, password_hash FROM staff WHERE is_active = 1
  `);
  const updates: Promise<void>[] = [];
  for (const row of r.rows as { id: number; phone: string; password_hash: string | null }[]) {
    if (!row.password_hash && row.phone) {
      const hash = await bcrypt.hash(row.phone, 10);
      updates.push(
        pool.query(`UPDATE staff SET password_hash = $1 WHERE id = $2`, [hash, row.id]).then(() => {})
      );
    }
  }
  if (updates.length > 0) await Promise.all(updates);
}
ensurePasswordColumn().catch(console.error);

router.get("/auth/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Chưa đăng nhập" });
  const token = header.slice(7);
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return res.status(401).json({ error: "Phiên đăng nhập hết hạn" });
    const r = await pool.query(`SELECT id, name, role, roles, phone, email, avatar FROM staff WHERE id = $1 AND is_active = 1`, [payload.id]);
    if (r.rows.length === 0) return res.status(401).json({ error: "Tài khoản không tồn tại" });
    const u = r.rows[0] as Record<string, unknown>;
    res.json({ id: u.id, name: u.name, role: u.role, roles: u.roles ?? [], phone: u.phone, email: u.email, avatar: u.avatar });
  } catch {
    return res.status(401).json({ error: "Token không hợp lệ" });
  }
});

router.post("/auth/login", async (req, res) => {
  const { phone, password } = req.body as { phone?: string; password?: string };
  if (!phone || !password) return res.status(400).json({ error: "Vui lòng nhập số điện thoại và mật khẩu" });

  const normalized = phone.trim().replace(/[\s\-\(\)\+\.]/g, "");
  let r;
  if (normalized.toLowerCase() === "admin") {
    r = await pool.query(
      `SELECT id, name, role, roles, phone, email, avatar, password_hash FROM staff
       WHERE (role = 'admin' OR roles::text LIKE '%admin%') AND is_active = 1
       ORDER BY id LIMIT 1`
    );
  } else {
    r = await pool.query(
      `SELECT id, name, role, roles, phone, email, avatar, password_hash FROM staff
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') = $1
       AND is_active = 1 LIMIT 1`,
      [normalized]
    );
  }
  if (r.rows.length === 0) return res.status(401).json({ error: "Số điện thoại hoặc mật khẩu không đúng" });
  const u = r.rows[0] as Record<string, unknown>;

  if (!u.password_hash) {
    const defaultPw = (u.phone as string | null) || "admin123";
    const hash = await bcrypt.hash(defaultPw, 10);
    await pool.query(`UPDATE staff SET password_hash = $1 WHERE id = $2`, [hash, u.id]);
    u.password_hash = hash;
  }

  const ok = await bcrypt.compare(password, u.password_hash as string);
  if (!ok) return res.status(401).json({ error: "Số điện thoại hoặc mật khẩu không đúng" });

  const payload = { id: u.id, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.SESSION_SECRET ?? "amazing-studio-secret-2025";
  const { createHmac } = await import("crypto");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const token = `${header}.${body}.${sig}`;

  res.json({
    token,
    user: {
      id: u.id, name: u.name, role: u.role, roles: u.roles ?? [],
      phone: u.phone, email: u.email, avatar: u.avatar,
    },
  });
});

router.post("/auth/change-password", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Chưa đăng nhập" });
  const token = header.slice(7);
  let callerId: number;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    callerId = payload.id;
  } catch {
    return res.status(401).json({ error: "Token không hợp lệ" });
  }

  const { targetId, currentPassword, newPassword } = req.body as { targetId?: number; currentPassword?: string; newPassword?: string };
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 4 ký tự" });

  const callerR = await pool.query(`SELECT id, role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  if (!caller) return res.status(401).json({ error: "Tài khoản không tồn tại" });

  const isAdmin = caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin"));
  const changingFor = targetId ?? callerId;

  if (!isAdmin && changingFor !== callerId) {
    return res.status(403).json({ error: "Không có quyền đổi mật khẩu người khác" });
  }

  if (changingFor === callerId && currentPassword) {
    const r2 = await pool.query(`SELECT password_hash FROM staff WHERE id = $1`, [callerId]);
    const existing = (r2.rows[0] as Record<string, unknown>)?.password_hash as string | null;
    if (existing) {
      const matches = await bcrypt.compare(currentPassword, existing);
      if (!matches) return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" });
    }
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query(`UPDATE staff SET password_hash = $1 WHERE id = $2`, [hash, changingFor]);
  res.json({ success: true });
});

export default router;
