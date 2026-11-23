import { usersRepository } from './users.repository.js';
import { encrypt, decrypt, maskPhone, maskIdCard } from '../../lib/crypto.js';
import { BadRequestError } from '../../lib/errors.js';
import { verifyCode } from '../sms/sms.service.js';

const PHONE_RE = /^1[3-9]\d{9}$/;
const IDCARD_RE = /^[0-9]{17}[0-9Xx]$/;

export interface ProfileView {
  hasPhone: boolean;
  phoneMasked: string | null;
  hasRealname: boolean;
  realName: string | null;
  idCardMasked: string | null;
  phoneConsentAt: number | null;
  realnameConsentAt: number | null;
  updatedAt: number | null;
}

/** 脱敏视图：绝不向客户端返回完整手机号/身份证号。 */
export function getProfileView(userId: string): ProfileView {
  const row = usersRepository.getProfile(userId);
  if (!row) {
    return {
      hasPhone: false, phoneMasked: null,
      hasRealname: false, realName: null, idCardMasked: null,
      phoneConsentAt: null, realnameConsentAt: null, updatedAt: null,
    };
  }
  let phoneMasked: string | null = null;
  let idCardMasked: string | null = null;
  if (row.phone_enc) {
    try { phoneMasked = maskPhone(decrypt(row.phone_enc)); } catch { /* ignore */ }
  }
  if (row.id_card_enc) {
    try { idCardMasked = maskIdCard(decrypt(row.id_card_enc)); } catch { /* ignore */ }
  }
  return {
    hasPhone: Boolean(row.phone_enc),
    phoneMasked,
    hasRealname: Boolean(row.id_card_enc),
    realName: row.real_name,
    idCardMasked,
    phoneConsentAt: row.phone_consent_at,
    realnameConsentAt: row.realname_consent_at,
    updatedAt: row.updated_at,
  };
}

/** 保存手机号：需短信验证码核验本人 + 知情同意，加密存储。 */
export function savePhone(userId: string, phone: string, code: string, consent: boolean): ProfileView {
  if (!consent) throw new BadRequestError('需要确认知情同意后才能保存手机号');
  if (!PHONE_RE.test(phone)) throw new BadRequestError('手机号格式不正确');
  verifyCode(phone, code);
  usersRepository.upsertPhone(userId, encrypt(phone), Date.now());
  return getProfileView(userId);
}

/** 保存自愿填写的实名信息。consent=true 表示用户确认知晓用途。 */
export function saveRealname(
  userId: string,
  realName: string,
  idCard: string,
  consent: boolean,
): ProfileView {
  if (!consent) throw new BadRequestError('需要确认知情同意后才能保存实名信息');
  const name = realName.trim();
  if (name.length < 2 || name.length > 40) throw new BadRequestError('姓名长度应为 2-40 个字符');
  if (!IDCARD_RE.test(idCard)) throw new BadRequestError('身份证号格式不正确');
  usersRepository.upsertRealname(userId, name, encrypt(idCard), Date.now());
  return getProfileView(userId);
}

/** 撤回手机号/实名信息（删除敏感数据）。 */
export function clearPhone(userId: string): ProfileView {
  usersRepository.upsertPhone(userId, null, null);
  return getProfileView(userId);
}
export function clearRealname(userId: string): ProfileView {
  usersRepository.upsertRealname(userId, null, null, null);
  return getProfileView(userId);
}
