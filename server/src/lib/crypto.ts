import crypto from 'node:crypto';
import { config } from '../config/env.js';

/** AES-256-GCM 加密，用于自愿填写的实名信息（身份证号等敏感字段）落库加密。 */
const KEY = Buffer.from(config.PII_ENCRYPTION_KEY, 'hex');

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('密文格式无效');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** 身份证号脱敏展示：保留前 4 后 4，中间打码。 */
export function maskIdCard(idCard: string): string {
  if (idCard.length <= 8) return '****';
  return `${idCard.slice(0, 4)}${'*'.repeat(idCard.length - 8)}${idCard.slice(-4)}`;
}

/** 手机号脱敏：138****8000 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '****';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
