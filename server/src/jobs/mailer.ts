import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

interface MailJobRow {
  id: string;
  idempotency_key: string;
  to_addr: string;
  subject: string;
  html: string;
  status: 'pending' | 'processing' | 'sent' | 'dead';
  attempts: number;
  max_attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface EnqueueMailInput {
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
}

const transporter: Transporter | null = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.smtpSecure,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      connectionTimeout: 8000,
    })
  : null;

if (!transporter) {
  logger.warn('未配置 SMTP_HOST，邮件任务仅入队不会实际发送（开发模式可用）');
}

const RETRY_BASE_MS = 10_000; // 指数退避基数：10s, 20s, 40s, 80s, 160s
const RELAY_LOCK_MS = 15 * 60 * 1000; // 中继领取后的锁定期，超时未回报则重新入队

export interface RelayMailJob {
  id: string;
  to: string;
  subject: string;
  html: string;
  attempts: number;
}

export interface RelayFailure {
  id: string;
  error: string;
}

/** 邮件任务队列：DB 持久化、幂等键去重、失败重试、超限进死信。 */
class MailQueue {
  enqueue(input: EnqueueMailInput): string {
    const now = Date.now();
    const id = randomUUID();
    // 幂等：相同 idempotencyKey 直接复用已有任务
    const existing = db.prepare('SELECT id FROM mail_jobs WHERE idempotency_key = ?').get(input.idempotencyKey) as
      | { id: string }
      | undefined;
    if (existing) return existing.id;

    try {
      db.prepare(`
        INSERT INTO mail_jobs
          (id, idempotency_key, to_addr, subject, html, status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, 5, ?, NULL, ?, ?)
      `).run(id, input.idempotencyKey, input.to, input.subject, input.html, now, now, now);
    } catch (err) {
      // 并发下唯一键冲突视为幂等成功
      const row = db.prepare('SELECT id FROM mail_jobs WHERE idempotency_key = ?').get(input.idempotencyKey) as
        | { id: string }
        | undefined;
      if (row) return row.id;
      throw err;
    }
    return id;
  }

  /** 处理一批待发送任务。返回本轮处理数量。 */
  async drain(batchSize = 10): Promise<number> {
    // 中继模式：邮件由 GitHub Actions 通过 HTTPS 接口领取并发送，本机不直连 SMTP
    if (config.mailRelayEnabled) return 0;
    if (!transporter) {
      // 无 SMTP：标记为已发送（开发占位），避免队列堆积
      const rows = db.prepare(`
        SELECT * FROM mail_jobs WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT ?
      `).all(Date.now(), batchSize) as unknown as MailJobRow[];
      for (const job of rows) {
        db.prepare("UPDATE mail_jobs SET status = 'sent', updated_at = ? WHERE id = ?").run(Date.now(), job.id);
      }
      return rows.length;
    }

    const rows = db.prepare(`
      SELECT * FROM mail_jobs WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT ?
    `).all(Date.now(), batchSize) as unknown as MailJobRow[];

    for (const job of rows) {
      try {
        await transporter.sendMail({
          from: config.MAIL_FROM,
          to: job.to_addr,
          subject: job.subject,
          html: job.html,
        });
        db.prepare("UPDATE mail_jobs SET status = 'sent', updated_at = ? WHERE id = ?").run(Date.now(), job.id);
        logger.info({ jobId: job.id, to: job.to_addr }, '考勤通知邮件已发送');
      } catch (err) {
        const attempts = job.attempts + 1;
        const dead = attempts >= job.max_attempts;
        const next = Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1);
        db.prepare(`
          UPDATE mail_jobs SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?
        `).run(dead ? 'dead' : 'pending', attempts, next, String(err instanceof Error ? err.message : err), Date.now(), job.id);
        logger.warn({ jobId: job.id, attempts, dead }, '邮件发送失败');
      }
    }
    return rows.length;
  }

  /** 中继模式：领取待发任务并加锁，避免 GitHub Actions 多次运行重复发送。 */
  claim(limit = 10): RelayMailJob[] {
    const now = Date.now();
    // 领取后超过锁定期仍未回报的任务，重新放回队列
    db.prepare(`
      UPDATE mail_jobs SET status = 'pending', next_attempt_at = ?
      WHERE status = 'processing' AND next_attempt_at <= ?
    `).run(now, now);

    const rows = db.prepare(`
      SELECT id, to_addr, subject, html, attempts
      FROM mail_jobs
      WHERE status = 'pending' AND next_attempt_at <= ?
      ORDER BY created_at LIMIT ?
    `).all(now, limit) as unknown as Array<Pick<MailJobRow, 'id' | 'to_addr' | 'subject' | 'html' | 'attempts'>>;
    if (!rows.length) return [];

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE mail_jobs SET status = 'processing', next_attempt_at = ?, updated_at = ?
      WHERE id IN (${placeholders})
    `).run(now + RELAY_LOCK_MS, now, ...ids);

    return rows.map((row) => ({
      id: row.id,
      to: row.to_addr,
      subject: row.subject,
      html: row.html,
      attempts: row.attempts,
    }));
  }

  /** 中继模式：接收发送结果，更新任务状态与重试计划。 */
  report(sentIds: string[], failures: RelayFailure[]): { sent: number; retried: number; dead: number } {
    const now = Date.now();
    const updateSent = db.prepare(`
      UPDATE mail_jobs SET status = 'sent', last_error = NULL, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `);
    const findJob = db.prepare(`
      SELECT attempts, max_attempts FROM mail_jobs WHERE id = ? AND status = 'processing'
    `) as { get: (id: string) => { attempts: number; max_attempts: number } | undefined };
    const updateFailed = db.prepare(`
      UPDATE mail_jobs SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `);

    let sent = 0;
    let retried = 0;
    let dead = 0;
    for (const id of sentIds) sent += Number(updateSent.run(now, id).changes);
    for (const failure of failures) {
      const job = findJob.get(failure.id);
      if (!job) continue;
      const attempts = job.attempts + 1;
      const isDead = attempts >= job.max_attempts;
      const next = now + RETRY_BASE_MS * 2 ** (attempts - 1);
      updateFailed.run(isDead ? 'dead' : 'pending', attempts, next, failure.error, now, failure.id);
      if (isDead) dead += 1;
      else retried += 1;
    }
    return { sent, retried, dead };
  }

  stats(): { pending: number; sent: number; dead: number } {
    const rows = db.prepare('SELECT status, COUNT(*) as c FROM mail_jobs GROUP BY status').all() as Array<{
      status: string; c: number;
    }>;
    const result = { pending: 0, sent: 0, dead: 0 };
    for (const r of rows) {
      if (r.status === 'pending') result.pending = r.c;
      else if (r.status === 'sent') result.sent = r.c;
      else if (r.status === 'dead') result.dead = r.c;
    }
    return result;
  }
}

export const mailQueue = new MailQueue();

let timer: NodeJS.Timeout | null = null;
let draining = false;

/** 启动后台轮询（独立进程语义：与 HTTP 请求解耦）。 */
export function startMailWorker(intervalMs = 5000): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (draining) return;
    draining = true;
    try {
      await mailQueue.drain();
    } catch (err) {
      logger.error({ err }, '邮件 worker 轮询异常');
    } finally {
      draining = false;
    }
  }, intervalMs);
  timer.unref?.();
  logger.info({ intervalMs }, '邮件后台 worker 已启动');
}

/** 优雅停机：停止轮询。 */
export function stopMailWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('邮件后台 worker 已停止');
  }
}
