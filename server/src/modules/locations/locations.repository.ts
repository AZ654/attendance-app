import { db } from '../../db/index.js';
import { rowsAs } from '../../db/helpers.js';

export interface LocationRow {
  id: string;
  user_id: string;
  consent_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  source: 'gps' | 'network' | 'manual';
  mode: 'active' | 'auto';
  within_geofence: number;
  distance_m: number | null;
  address: string | null;
  recorded_at: number;
  created_at: number;
}

export interface LocationInsert extends LocationRow {}

export const locationsRepository = {
  insert(row: LocationInsert): void {
    db.prepare(`
      INSERT INTO locations
        (id, user_id, consent_id, latitude, longitude, accuracy_m, source, mode,
         within_geofence, distance_m, address, recorded_at, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.user_id, row.consent_id, row.latitude, row.longitude, row.accuracy_m,
      row.source, row.mode, row.within_geofence, row.distance_m, row.address,
      row.recorded_at, row.created_at,
    );
  },

  listByUser(userId: string, limit: number, offset: number): LocationRow[] {
    return db.prepare(`
      SELECT * FROM locations WHERE user_id = ?
      ORDER BY recorded_at DESC LIMIT ? OFFSET ?
    `).all(userId, limit, offset) as unknown as LocationRow[];
  },

  listAll(limit: number, offset: number, userId?: string): Array<LocationRow & { nickname: string | null; real_name: string | null }> {
    if (userId) {
      return rowsAs<LocationRow & { nickname: string | null; real_name: string | null }>(db.prepare(`
        SELECT l.*, u.nickname, p.real_name
        FROM locations l
        LEFT JOIN users u ON u.id = l.user_id
        LEFT JOIN user_profiles p ON p.user_id = l.user_id
        WHERE l.user_id = ?
        ORDER BY l.recorded_at DESC LIMIT ? OFFSET ?
      `).all(userId, limit, offset));
    }
    return rowsAs<LocationRow & { nickname: string | null; real_name: string | null }>(db.prepare(`
      SELECT l.*, u.nickname, p.real_name
      FROM locations l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN user_profiles p ON p.user_id = l.user_id
      ORDER BY l.recorded_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset));
  },

  /** 幂等键：同一用户同一模式在短时间窗口内只保留一条，避免重复上报刷屏。 */
  existsRecent(userId: string, mode: string, sinceMs: number): boolean {
    const row = db.prepare(`
      SELECT 1 FROM locations WHERE user_id = ? AND mode = ? AND created_at >= ? LIMIT 1
    `).get(userId, mode, sinceMs);
    return Boolean(row);
  },

  /** 当日首次有效打卡（用于每日统计）。 */
  countTodayByUser(userId: string, dayStartMs: number): number {
    const row = db.prepare(`
      SELECT COUNT(*) as c FROM locations
      WHERE user_id = ? AND within_geofence = 1 AND recorded_at >= ?
    `).get(userId, dayStartMs) as unknown as { c: number };
    return Number((row as { c: number }).c);
  },
};
