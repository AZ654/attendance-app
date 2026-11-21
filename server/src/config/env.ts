import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 从 server 根目录加载 .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const hex32 = z.string().regex(/^[0-9a-fA-F]{64}$/, '必须是 32 字节的 hex（64 位十六进制字符）');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  // Cookie SameSite：本地同源用 lax；前端与后端不同域（如 GitHub Pages + 公网后端）时用 none
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  DATABASE_PATH: z.string().default('./data/attendance.db'),

  WECHAT_APP_ID: z.string().default(''),
  WECHAT_APP_SECRET: z.string().default(''),
  // 授权回调地址必须指向前端 /login 页面（前端负责读取 code 调 /auth/login-by-code）
  WECHAT_REDIRECT_URI: z.string().default(''),
  AUTH_DEV_MODE: z.enum(['true', 'false']).default('false'),
  AUTH_DEV_OPENID: z.string().default('dev-openid-001'),
  // 电脑端账号密码登录（与微信登录并存）
  PASSWORD_LOGIN_ENABLED: z.enum(['true', 'false']).default('true'),

  ATTENDANCE_RADIUS_METERS: z.coerce.number().int().positive().default(500),
  OFFICE_LAT: z.coerce.number().min(-90).max(90).default(22.5431),
  OFFICE_LNG: z.coerce.number().min(-180).max(180).default(114.0579),

  // 逆地理编码（高德地图 WebService，合规白名单；在高德开放平台自行申请 Web服务API 类型 key）
  // 未配置或为占位符时，地址解析自动跳过，不影响打卡主流程
  AMAP_KEY: z.string().default(''),
  // 高德数字签名密钥（可选）：仅当 key 开启了数字签名时需要；默认不开启，留空即可
  AMAP_SECRET: z.string().default(''),
  // 输入坐标类型：wgs84（浏览器 GPS 原始坐标，将转换为 GCJ-02）| gcj02（已是火星坐标，直接用）
  GEO_INPUT_COORD: z.enum(['wgs84', 'gcj02']).default('wgs84'),
  GEO_REVERSE_ENABLED: z.enum(['true', 'false']).default('true'),
  WORK_START_TIME: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  WORK_END_TIME: z.string().regex(/^\d{2}:\d{2}$/).default('18:00'),
  WORK_DAYS: z.string().default('1,2,3,4,5'),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('考勤系统 <noreply@example.com>'),
  ATTENDANCE_MAIL_TO: z.string().default('246507604@qq.com'),

  // Railway Hobby 计划屏蔽 SMTP 端口：开启后由 GitHub Actions 通过 HTTPS 接口代发
  MAIL_RELAY_ENABLED: z.enum(['true', 'false']).default('false'),
  MAIL_RELAY_TOKEN: z.string().default(''),

  PII_ENCRYPTION_KEY: hex32,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`[config] 环境变量校验失败，启动中止：\n${details}`);
  process.exit(1);
}

const raw = parsed.data;

// 生产环境强制校验关键项，快速失败
if (raw.NODE_ENV === 'production') {
  const required: Array<[keyof typeof raw, string]> = [
    ['JWT_ACCESS_SECRET', 'JWT 访问令牌密钥'],
    ['JWT_REFRESH_SECRET', 'JWT 刷新令牌密钥'],
    ['CORS_ORIGIN', 'CORS 来源'],
    ['PII_ENCRYPTION_KEY', '个人信息加密密钥'],
  ];
  // 若只使用电脑端账号登录，可不配置微信；否则微信凭证必须齐全
  if (raw.PASSWORD_LOGIN_ENABLED !== 'true') {
    required.push(
      ['WECHAT_APP_ID', '微信 AppID'],
      ['WECHAT_APP_SECRET', '微信 AppSecret'],
      ['WECHAT_REDIRECT_URI', '微信回调地址'],
    );
  }
  const missing = required.filter(([key]) => !raw[key] || String(raw[key]).startsWith('replace_'));
  if (missing.length) {
    console.error(`[config] 生产环境缺少必要配置：${missing.map(([, n]) => n).join('、')}`);
    process.exit(1);
  }
  if (raw.MAIL_RELAY_ENABLED === 'true' && !raw.MAIL_RELAY_TOKEN) {
    console.error('[config] 已开启邮件中继但未配置 MAIL_RELAY_TOKEN');
    process.exit(1);
  }
  if (raw.CORS_ORIGIN.includes('*')) {
    console.error('[config] 生产环境 CORS_ORIGIN 不允许使用通配符');
    process.exit(1);
  }
  if (raw.AUTH_DEV_MODE === 'true') {
    console.error('[config] 生产环境禁止开启 AUTH_DEV_MODE');
    process.exit(1);
  }
}

export const config = Object.freeze({
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDevMode: raw.AUTH_DEV_MODE === 'true',
  passwordLoginEnabled: raw.PASSWORD_LOGIN_ENABLED === 'true',
  cookieSameSite: raw.COOKIE_SAMESITE,
  // SameSite=None 必须由 HTTPS 承载，强制 Secure
  cookieSecure: raw.NODE_ENV === 'production' || raw.COOKIE_SAMESITE === 'none',
  corsOrigins: raw.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  mailTo: raw.ATTENDANCE_MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
  mailRelayEnabled: raw.MAIL_RELAY_ENABLED === 'true',
  mailRelayToken: raw.MAIL_RELAY_TOKEN,
  workDays: raw.WORK_DAYS.split(',').map((s) => Number(s.trim())).filter((n) => n >= 0 && n <= 6),
  smtpSecure: raw.SMTP_SECURE === 'true',
  geoReverseEnabled:
    raw.GEO_REVERSE_ENABLED === 'true' &&
    Boolean(raw.AMAP_KEY) &&
    !raw.AMAP_KEY.startsWith('replace_') &&
    !raw.AMAP_KEY.startsWith('Please apply'),
  dbPath: path.isAbsolute(raw.DATABASE_PATH)
    ? raw.DATABASE_PATH
    : path.resolve(__dirname, '../../', raw.DATABASE_PATH),
});

export type Config = typeof config;
