import { db } from '../../db/index.js';

export interface UserRow {
  id: string;
  openid: string;
  unionid: string | null;
  role: 'employee' | 'admin';
  nickname: string | null;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefreshRow {
  jti: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked_at: number | null;
  created_at: number;
}

export const authRepository = {
  findUserByOpenid(openid: string): UserRow | undefined {
    return db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as UserRow | undefined;
  },

  findUserById(id: string): UserRow | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  },

  createUser(user: Omit<UserRow, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string }): UserRow {
    db.prepare(`
      INSERT INTO users (id, openid, unionid, role, nickname, avatar, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, user.openid, user.unionid, user.role, user.nickname, user.avatar, user.created_at, user.updated_at);
    return user as UserRow;
  },

  updateProfile(id: string, nickname: string | null, avatar: string | null): void {
    db.prepare('UPDATE users SET nickname = ?, avatar = ?, updated_at = ? WHERE id = ?')
      .run(nickname, avatar, new Date().toISOString(), id);
  },

  saveRefreshToken(row: RefreshRow): void {
    db.prepare(`
      INSERT INTO refresh_tokens (jti, user_id, token_hash, expires_at, revoked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.jti, row.user_id, row.token_hash, row.expires_at, row.revoked_at, row.created_at);
  },

  findRefreshToken(jti: string): RefreshRow | undefined {
    return db.prepare('SELECT * FROM refresh_tokens WHERE jti = ?').get(jti) as RefreshRow | undefined;
  },

  revokeRefreshToken(jti: string, at: number): void {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE jti = ?').run(at, jti);
  },

  revokeAllRefreshForUser(userId: string, at: number): void {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(at, userId);
  },

  purgeExpiredTokens(now: number): void {
    db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(now);
  },

  /** 设置首个用户为管理员，便于演示管理端；生产应由运营后台指定。 */
  countUsers(): number {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    return row.c;
  },
};
