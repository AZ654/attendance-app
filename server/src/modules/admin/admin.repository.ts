import { db } from '../../db/index.js';
import type { LocationRow } from '../locations/locations.repository.js';

export interface EmployeeSummary {
  id: string;
  nickname: string | null;
  username: string | null;
  role: string;
  createdAt: string;
  consentActive: boolean;
  lastReportAt: number | null;
  todayCheckins: number;
  hasPhone: boolean;
  hasRealname: boolean;
}

export const adminRepository = {
  listEmployees(dayStartMs: number): EmployeeSummary[] {
    const rows = db.prepare(`
      SELECT u.id, u.nickname, u.username, u.role, u.created_at,
        (SELECT COUNT(*) FROM consents c WHERE c.user_id = u.id AND c.revoked_at IS NULL) AS consent_count,
        (SELECT MAX(l.recorded_at) FROM locations l WHERE l.user_id = u.id) AS last_report,
        (SELECT COUNT(*) FROM locations l WHERE l.user_id = u.id AND l.within_geofence = 1 AND l.recorded_at >= ?) AS today_checkins,
        (SELECT COUNT(*) FROM user_profiles p WHERE p.user_id = u.id AND p.phone_enc IS NOT NULL) AS has_phone,
        (SELECT COUNT(*) FROM user_profiles p WHERE p.user_id = u.id AND p.id_card_enc IS NOT NULL) AS has_realname
      FROM users u ORDER BY u.created_at ASC
    `).all(dayStartMs) as Array<{
      id: string; nickname: string | null; username: string | null; role: string; created_at: string;
      consent_count: number; last_report: number | null; today_checkins: number;
      has_phone: number; has_realname: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      username: r.username,
      role: r.role,
      createdAt: r.created_at,
      consentActive: r.consent_count > 0,
      lastReportAt: r.last_report,
      todayCheckins: r.today_checkins,
      hasPhone: r.has_phone > 0,
      hasRealname: r.has_realname > 0,
    }));
  },
};

export type AdminLocationRow = LocationRow & { nickname: string | null; real_name: string | null };
