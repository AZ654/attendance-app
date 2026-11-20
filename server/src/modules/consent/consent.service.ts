import { randomUUID } from 'node:crypto';
import { consentRepository, type ConsentRow } from './consent.repository.js';
import { config } from '../../config/env.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';

export interface ConsentView {
  id: string;
  purpose: string;
  scope: string;
  workStart: string;
  workEnd: string;
  grantedAt: number;
  revokedAt: number | null;
  active: boolean;
}

export function toView(row: ConsentRow): ConsentView {
  return {
    id: row.id,
    purpose: row.purpose,
    scope: row.scope,
    workStart: row.work_start,
    workEnd: row.work_end,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    active: row.revoked_at === null,
  };
}

/** 授权告知文案：明确采集什么、范围、时段、发给谁、如何撤回。 */
export function consentNotice() {
  return {
    title: '位置采集单独授权',
    purpose: '仅用于员工考勤打卡与出勤核对',
    scope: `采集您设备的 GPS/网络位置，工作时段内自动上报，考勤判定范围 ${config.ATTENDANCE_RADIUS_METERS} 米`,
    workWindow: `${config.WORK_START_TIME} - ${config.WORK_END_TIME}`,
    recipients: config.mailTo.length ? config.mailTo : ['（未配置通知邮箱）'],
    retention: '位置记录仅用于考勤核对，保留期由管理员配置',
    revocable: '您可以随时在"我的授权"中撤回，撤回后立即停止采集',
    required: true,
  };
}

export function grantConsent(userId: string, acknowledged: boolean): ConsentView {
  if (!acknowledged) throw new BadRequestError('需要确认已阅读并同意告知内容');
  const notice = consentNotice();
  const row: ConsentRow = {
    id: randomUUID(),
    user_id: userId,
    purpose: notice.purpose,
    scope: notice.scope,
    work_start: config.WORK_START_TIME,
    work_end: config.WORK_END_TIME,
    granted_at: Date.now(),
    revoked_at: null,
    version: 1,
  };
  consentRepository.grant(row);
  return toView(row);
}

export function revokeConsent(userId: string): { revoked: boolean } {
  const changes = consentRepository.revoke(userId, Date.now());
  return { revoked: changes > 0 };
}

export function getMyConsent(userId: string): ConsentView | null {
  const row = consentRepository.getActive(userId);
  return row ? toView(row) : null;
}

export function getConsentHistory(userId: string): ConsentView[] {
  return consentRepository.history(userId).map(toView);
}

/** 校验授权是否处于有效状态（供位置上报调用）。 */
export function requireValidConsent(userId: string): ConsentRow {
  const row = consentRepository.getActive(userId);
  if (!row) throw new NotFoundError('未找到有效授权，请先完成位置采集授权');
  return row;
}

/** 判断当前是否处于允许采集的工作时段（服务端时间）。 */
export function isWithinWorkWindow(now = new Date()): boolean {
  const day = now.getDay();
  if (!config.workDays.includes(day)) return false;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hhmm >= config.WORK_START_TIME && hhmm <= config.WORK_END_TIME;
}
