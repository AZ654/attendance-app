import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { BadRequestError, ExternalServiceError, TooManyRequestsError } from '../../lib/errors.js';
import { sha256 } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { smsRepository } from './sms.repository.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const PHONE_RE = /^1[3-9]\d{9}$/;

/** 手机号哈希后入库，避免明文出现在验证码表。 */
function phoneHash(phone: string): string {
  return sha256(`phone:${phone}`);
}
function codeHash(phone: string, code: string): string {
  return sha256(`code:${phone}:${code}`);
}

export interface SendResult {
  expiresIn: number;
  /** 仅 dev 模式返回，便于本地联调；生产（tencent）恒为 undefined。 */
  devCode?: string;
  devMode: boolean;
}

/** 生成并发送验证码。dev 模式不真正发短信，验证码随响应返回并写入日志。 */
export async function sendCode(phone: string): Promise<SendResult> {
  if (!PHONE_RE.test(phone)) throw new BadRequestError('手机号格式不正确');
  const now = Date.now();
  smsRepository.purgeExpired(now);
  const hash = phoneHash(phone);
  const last = smsRepository.lastSentAt(hash);
  if (last !== null && now - last < RESEND_INTERVAL_MS) {
    throw new TooManyRequestsError('发送过于频繁，请 60 秒后重试');
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  smsRepository.issue(hash, codeHash(phone, code), CODE_TTL_MS, now);

  const devMode = config.smsProvider === 'dev';
  if (devMode) {
    logger.warn({ phone: `${phone.slice(0, 3)}****${phone.slice(-4)}`, code }, '短信开发模式：验证码未真实发送');
    return { expiresIn: CODE_TTL_MS / 1000, devCode: code, devMode: true };
  }

  if (!config.smsConfigured) {
    throw new ExternalServiceError('短信服务未配置，请联系管理员');
  }
  await sendViaTencent(phone, code);
  return { expiresIn: CODE_TTL_MS / 1000, devMode: false };
}

/** 校验验证码：一次性使用、有限次尝试、过期失效。 */
export function verifyCode(phone: string, code: string): void {
  if (!PHONE_RE.test(phone)) throw new BadRequestError('手机号格式不正确');
  if (!/^\d{6}$/.test(code)) throw new BadRequestError('验证码格式不正确');
  const hash = phoneHash(phone);
  const row = smsRepository.findActive(hash);
  if (!row) throw new BadRequestError('验证码不存在或已失效，请重新获取');
  const now = Date.now();
  if (row.expires_at <= now) throw new BadRequestError('验证码已过期，请重新获取');
  if (row.attempts >= MAX_ATTEMPTS) throw new TooManyRequestsError('尝试次数过多，请重新获取验证码');

  const expected = codeHash(phone, code);
  const ok = safeEqual(row.code_hash, expected);
  if (!ok) {
    smsRepository.bumpAttempts(row.id);
    throw new BadRequestError('验证码不正确');
  }
  smsRepository.consume(row.id, now);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** 腾讯云短信 SendSms（TC3-HMAC-SHA256 签名，零 SDK 依赖）。 */
async function sendViaTencent(phone: string, code: string): Promise<void> {
  const endpoint = 'sms.tencentcloudapi.com';
  const action = 'SendSms';
  const version = '2021-01-11';
  const region = 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: config.SMS_SDK_APP_ID,
    SignName: config.SMS_SIGN_NAME,
    TemplateId: config.SMS_TEMPLATE_ID,
    TemplateParamSet: [code, String(CODE_TTL_MS / 60 / 1000)],
  });

  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalRequest = [
    'POST', '/', '',
    `content-type:application/json; charset=utf-8\nhost:${endpoint}\n`,
    'content-type;host', hashedPayload,
  ].join('\n');
  const stringToSign = [
    'TC3-HMAC-SHA256', timestamp, `${date}/sms/tc3_request`,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (key: crypto.BinaryLike, msg: string) => crypto.createHmac('sha256', key).update(msg).digest();
  const secretDate = hmac(`TC3${config.SMS_SECRET_KEY}`, date);
  const secretService = hmac(secretDate, 'sms');
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${config.SMS_SECRET_ID}/${date}/sms/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`;

  let res: globalThis.Response;
  try {
    res = await fetch(`https://${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: endpoint,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': region,
      },
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    logger.error({ err }, '腾讯云短信请求失败');
    throw new ExternalServiceError('短信发送失败，请稍后重试');
  }
  const body = (await res.json()) as { Response?: { Error?: { Code: string; Message: string } } };
  const err = body?.Response?.Error;
  if (err) {
    logger.error({ code: err.Code, message: err.Message }, '腾讯云短信返回错误');
    throw new ExternalServiceError('短信发送失败，请稍后重试');
  }
}
