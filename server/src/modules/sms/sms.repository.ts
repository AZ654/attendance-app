import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { rowAs } from '../../db/helpers.js';

export interface SmsCodeRow {
  id: string;
  phone_hash: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  consumed_at: number | null;
  created_at: number;
}

export const smsRepository = {
  /** 使该手机号之前的未消费验证码失效，返回新验证码记录 id。 */
  issue(phoneHash: string, codeHash: string, ttlMs: number, now: number): string {
    db.prepare('UPDATE sms_codes SET consumed_at = ? WHERE phone_hash = ? AND consumed_at IS NULL')
      .run(now, phoneHash);
    const id = randomUUID();
    db.prepare(`
      INSERT INTO sms_codes (id, phone_hash, code_hash, expires_at, attempts, consumed_at, created_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?)
    `).run(id, phoneHash, codeHash, now + ttlMs, now);
    return id;
  },

  /** 取该手机号最近一条未消费验证码。 */
  findActive(phoneHash: string): SmsCodeRow | undefined {
    return rowAs<SmsCodeRow>(
      db.prepare(`
        SELECT * FROM sms_codes
        WHERE phone_hash = ? AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1
      `).get(phoneHash),
    );
  },

  /** 验证码校验尝试次数 +1。 */
  bumpAttempts(id: string): void {
    db.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE id = ?').run(id);
  },

  /** 标记验证码已消费（一次性使用）。 */
  consume(id: string, now: number): void {
    db.prepare('UPDATE sms_codes SET consumed_at = ? WHERE id = ?').run(now, id);
  },

  /** 发送频率限制：距上次发送不足 intervalMs 时拒绝。 */
  lastSentAt(phoneHash: string): number | null {
    const row = rowAs<{ created_at: number }>(
      db.prepare('SELECT created_at FROM sms_codes WHERE phone_hash = ? ORDER BY created_at DESC LIMIT 1')
        .get(phoneHash),
    );
    return row?.created_at ?? null;
  },

  /** 清理过期记录（惰性，随发送触发）。 */
  purgeExpired(now: number): void {
    db.prepare('DELETE FROM sms_codes WHERE expires_at < ?').run(now - 24 * 60 * 60 * 1000);
  },
};
