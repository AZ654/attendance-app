import { adminRepository } from './admin.repository.js';
import { locationsRepository } from '../locations/locations.repository.js';
import { toView, type LocationView } from '../locations/locations.service.js';

function todayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function listEmployees() {
  return adminRepository.listEmployees(todayStartMs());
}

export type AdminLocationView = LocationView & { nickname: string | null; realName: string | null };

export function listAllLocations(limit: number, offset: number, userId?: string): AdminLocationView[] {
  const rows = locationsRepository.listAll(limit, offset, userId);
  return rows.map((row) => ({
    ...toView(row),
    nickname: row.nickname,
    realName: row.real_name,
  }));
}
