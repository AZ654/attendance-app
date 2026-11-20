import { db } from '../../db/index.js';

export interface ProfileRow {
  user_id: string;
  phone_enc: string | null;
  real_name: string | null;
  id_card_enc: string | null;
  phone_consent_at: number | null;
  realname_consent_at: number | null;
  updated_at: number;
}

export const usersRepository = {
  getProfile(userId: string): ProfileRow | undefined {
    return db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) as ProfileRow | undefined;
  },

  upsertPhone(userId: string, phoneEnc: string | null, consentAt: number | null): void {
    const existing = this.getProfile(userId);
    if (!existing) {
      db.prepare(`
        INSERT INTO user_profiles (user_id, phone_enc, real_name, id_card_enc, phone_consent_at, realname_consent_at, updated_at)
        VALUES (?, ?, NULL, NULL, ?, NULL, ?)
      `).run(userId, phoneEnc, consentAt, Date.now());
    } else {
      db.prepare(`
        UPDATE user_profiles SET phone_enc = ?, phone_consent_at = ?, updated_at = ? WHERE user_id = ?
      `).run(phoneEnc, consentAt, Date.now(), userId);
    }
  },

  upsertRealname(
    userId: string,
    realName: string | null,
    idCardEnc: string | null,
    consentAt: number | null,
  ): void {
    const existing = this.getProfile(userId);
    if (!existing) {
      db.prepare(`
        INSERT INTO user_profiles (user_id, phone_enc, real_name, id_card_enc, phone_consent_at, realname_consent_at, updated_at)
        VALUES (?, NULL, ?, ?, NULL, ?, ?)
      `).run(userId, realName, idCardEnc, consentAt, Date.now());
    } else {
      db.prepare(`
        UPDATE user_profiles SET real_name = ?, id_card_enc = ?, realname_consent_at = ?, updated_at = ? WHERE user_id = ?
      `).run(realName, idCardEnc, consentAt, Date.now(), userId);
    }
  },
};
