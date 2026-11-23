import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import type { TokenPair } from './auth.service.js';

export interface QrSessionRow {
  id: string;
  status: 'pending' | 'logged_in' | 'expired';
  access_token: string | null;
  refresh_token: string | null;
  user_json: string | null;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

export interface CreatedQrSession {
  id: string;
  expiresAt: number;
}

export const qrSessionRepository = {
  create(now: number, ttlMs: number): CreatedQrSession {
    const id = randomUUID();
    const expiresAt = now + ttlMs;
    db.prepare(`
      INSERT INTO qr_login_sessions (id, status, expires_at, created_at, updated_at)
      VALUES (?, 'pending', ?, ?, ?)
    `).run(id, expiresAt, now, now);
    db.prepare('DELETE FROM qr_login_sessions WHERE expires_at < ?').run(now);
    return { id, expiresAt };
  },

  find(id: string): QrSessionRow | undefined {
    return db.prepare('SELECT * FROM qr_login_sessions WHERE id = ?').get(id) as QrSessionRow | undefined;
  },

  markLoggedIn(id: string, tokens: TokenPair, now: number): boolean {
    const result = db.prepare(`
      UPDATE qr_login_sessions
      SET status = 'logged_in', access_token = ?, refresh_token = ?, user_json = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND expires_at > ?
    `).run(tokens.accessToken, tokens.refreshToken, JSON.stringify(tokens.user), now, id, now);
    return Number(result.changes) > 0;
  },

  markExpired(id: string, now: number): void {
    db.prepare("UPDATE qr_login_sessions SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'").run(now, id);
  },
};
