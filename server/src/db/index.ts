import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { rowsAs } from './helpers.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

/** 使用 Node 22 内置 SQLite，零编译依赖。 */
export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      openid        TEXT NOT NULL UNIQUE,
      unionid       TEXT,
      role          TEXT NOT NULL DEFAULT 'employee',
      nickname      TEXT,
      avatar        TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti         TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      revoked_at  INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone_enc     TEXT,
      real_name     TEXT,
      id_card_enc   TEXT,
      phone_consent_at   INTEGER,
      realname_consent_at INTEGER,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consents (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose       TEXT NOT NULL,
      scope         TEXT NOT NULL,
      work_start    TEXT NOT NULL,
      work_end      TEXT NOT NULL,
      granted_at    INTEGER NOT NULL,
      revoked_at    INTEGER,
      version       INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_consent_user ON consents(user_id);

    CREATE TABLE IF NOT EXISTS locations (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consent_id    TEXT NOT NULL REFERENCES consents(id),
      latitude      REAL NOT NULL,
      longitude     REAL NOT NULL,
      accuracy_m    REAL,
      source        TEXT NOT NULL,
      mode          TEXT NOT NULL,
      within_geofence INTEGER NOT NULL,
      distance_m    REAL,
      address       TEXT,
      recorded_at   INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_location_user_time ON locations(user_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS mail_jobs (
      id           TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      to_addr      TEXT NOT NULL,
      subject      TEXT NOT NULL,
      html         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      attempts     INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at INTEGER NOT NULL,
      last_error   TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mail_status ON mail_jobs(status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS qr_login_sessions (
      state        TEXT PRIMARY KEY,
      status       TEXT NOT NULL DEFAULT 'pending',
      identity_json TEXT,
      expires_at   INTEGER NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qr_login_expires ON qr_login_sessions(expires_at);
  `);

  // 兼容已有数据库：为电脑端账号登录增加字段（幂等迁移）
  const userColumns = new Set(
    rowsAs<{ name: string }>(db.prepare('PRAGMA table_info(users)').all()).map((row) => row.name),
  );
  if (!userColumns.has('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  if (!userColumns.has('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  if (!userColumns.has('password_salt')) db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL');

  logger.info('数据库 schema 初始化完成');
}
