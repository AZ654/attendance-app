import { db } from '../../db/index.js';
import { rowsAs, rowAs } from '../../db/helpers.js';

export interface ConsentRow {
  id: string;
  user_id: string;
  purpose: string;
  scope: string;
  work_start: string;
  work_end: string;
  granted_at: number;
  revoked_at: number | null;
  version: number;
}

export const consentRepository = {
  getActive(userId: string): ConsentRow | undefined {
    return rowAs<ConsentRow>(db.prepare(`
      SELECT * FROM consents WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY granted_at DESC LIMIT 1
    `).get(userId));
  },

  getById(id: string): ConsentRow | undefined {
    return rowAs<ConsentRow>(db.prepare('SELECT * FROM consents WHERE id = ?').get(id));
  },

  grant(row: ConsentRow): void {
    // 授予新授权时，先撤回旧的
    db.prepare('UPDATE consents SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(Date.now(), row.user_id);
    db.prepare(`
      INSERT INTO consents (id, user_id, purpose, scope, work_start, work_end, granted_at, revoked_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.user_id, row.purpose, row.scope, row.work_start, row.work_end, row.granted_at, row.revoked_at, row.version);
  },

  revoke(userId: string, at: number): number {
    const result = db.prepare(`
      UPDATE consents SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
    `).run(at, userId);
    return Number(result.changes);
  },

  history(userId: string): ConsentRow[] {
    return rowsAs<ConsentRow>(db.prepare('SELECT * FROM consents WHERE user_id = ? ORDER BY granted_at DESC LIMIT 20')
      .all(userId));
  },
};
