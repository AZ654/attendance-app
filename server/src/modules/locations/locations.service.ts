import { randomUUID } from 'node:crypto';
import { locationsRepository, type LocationRow } from './locations.repository.js';
import { consentRepository, type ConsentRow } from '../consent/consent.repository.js';
import { isWithinWorkWindow } from '../consent/consent.service.js';
import { config } from '../../config/env.js';
import { BadRequestError, ForbiddenError } from '../../lib/errors.js';
import { mailQueue } from '../../jobs/mailer.js';
import { notifyMailRelay } from '../../jobs/mail-trigger.js';
import { authRepository } from '../auth/auth.repository.js';
import { haversineDistance } from '../../lib/geo.js';
import { reverseGeocode } from '../../lib/geocoder.js';

export { haversineDistance } from '../../lib/geo.js';

export interface ReportLocationInput {
  userId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  source: 'gps' | 'network' | 'manual';
  mode: 'active' | 'auto';
  address?: string | null;
}

export interface ReportResult {
  id: string;
  withinGeofence: boolean;
  distanceM: number | null;
  address: string | null;
  recordedAt: number;
  autoModeBlocked?: boolean;
}

/** 考勤基准点（公司位置），来自集中配置。 */
const OFFICE_LAT = config.OFFICE_LAT;
const OFFICE_LNG = config.OFFICE_LNG;

function validateInput(input: ReportLocationInput): void {
  if (input.latitude < -90 || input.latitude > 90) throw new BadRequestError('纬度无效');
  if (input.longitude < -180 || input.longitude > 180) throw new BadRequestError('经度无效');
  if (!['gps', 'network', 'manual'].includes(input.source)) throw new BadRequestError('定位来源无效');
  if (!['active', 'auto'].includes(input.mode)) throw new BadRequestError('上报模式无效');
}

/** 上报位置：校验有效授权 → 逆地理编码 → 计算范围 → 落库 → 异步发通知邮件（任何定位打卡都记录并通知）。 */
export async function reportLocation(input: ReportLocationInput): Promise<ReportResult> {
  validateInput(input);

  const consent = consentRepository.getActive(input.userId);
  if (!consent) throw new ForbiddenError('未找到有效位置采集授权，请先完成授权');

  // 工作时段仅用于邮件标注，不再拦截：只要有定位打卡就落库并发邮件。
  const withinWorkWindow = isWithinWorkWindow();
  const now = Date.now();
  const distance = haversineDistance(input.latitude, input.longitude, OFFICE_LAT, OFFICE_LNG);
  const within = distance <= config.ATTENDANCE_RADIUS_METERS;

  // 逆地理编码：把坐标解析为具体地址（失败返回 null，不影响打卡）
  const address = (await reverseGeocode(input.latitude, input.longitude)) ?? input.address ?? null;

  const row: LocationRow = {
    id: randomUUID(),
    user_id: input.userId,
    consent_id: consent.id,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_m: input.accuracyM ?? null,
    source: input.source,
    mode: input.mode,
    within_geofence: within ? 1 : 0,
    distance_m: Math.round(distance * 10) / 10,
    address,
    recorded_at: now,
    created_at: now,
  };
  locationsRepository.insert(row);

  // 异步邮件任务，不阻塞请求；任何定位打卡都通知
  enqueueLocationMail(row, consent, withinWorkWindow);

  return {
    id: row.id,
    withinGeofence: within,
    distanceM: row.distance_m,
    address: row.address,
    recordedAt: now,
  };
}

function enqueueLocationMail(row: LocationRow, consent: ConsentRow, withinWorkWindow: boolean): void {
  if (!config.mailTo.length) return;
  const user = authRepository.findUserById(row.user_id);
  const name = (user?.nickname ?? '员工').replace(/[<>&"']/g, '');
  const status = row.within_geofence ? '✅ 考勤范围内' : '⚠️ 考勤范围外';
  const timeStatus = withinWorkWindow ? '工作时段内' : '⚠️ 工作时段外';
  const subject = `考勤位置上报 - ${name} - ${status} - ${timeStatus}`;
  const html = `
    <div style="font-family:sans-serif;line-height:1.6">
      <h3>考勤位置上报通知</h3>
      <p>员工：<b>${name}</b></p>
      <p>状态：<b>${status}</b>　时段：<b>${timeStatus}</b></p>
      <p>时间：${new Date(row.recorded_at).toLocaleString('zh-CN')}</p>
      <p>坐标：${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}（精度 ${row.accuracy_m ?? '未知'} 米）</p>
      <p>定位来源：${row.source}　模式：${row.mode === 'active' ? '主动上报' : '自动上报'}</p>
      <p>距考勤点：${row.distance_m ?? '未知'} 米</p>
      ${row.address ? `<p>地址：${row.address.replace(/[<>&"']/g, '')}</p>` : ''}
      <hr/>
      <p style="color:#888;font-size:12px">本邮件由考勤系统自动发送。位置采集基于该员工的单独授权（授权编号 ${consent.id}），授权可随时撤回。</p>
    </div>
  `;
  mailQueue.enqueue({
    idempotencyKey: `location:${row.id}`,
    to: config.mailTo.join(','),
    subject,
    html,
  });
  // 即时触发中继（配置了 GITHUB_TOKEN 才生效）；未配置时保持原 cron 发送行为
  notifyMailRelay();
}

export interface LocationView {
  id: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  source: string;
  mode: string;
  withinGeofence: boolean;
  distanceM: number | null;
  address: string | null;
  recordedAt: number;
}

export function toView(row: LocationRow): LocationView {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    source: row.source,
    mode: row.mode,
    withinGeofence: Boolean(row.within_geofence),
    distanceM: row.distance_m,
    address: row.address,
    recordedAt: row.recorded_at,
  };
}

export function listMyLocations(userId: string, limit: number, offset: number): LocationView[] {
  return locationsRepository.listByUser(userId, limit, offset).map(toView);
}
