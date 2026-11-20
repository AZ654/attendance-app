export interface PublicUser {
  id: string;
  role: 'employee' | 'admin';
  openid: string;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

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

export interface ConsentNotice {
  title: string;
  purpose: string;
  scope: string;
  workWindow: string;
  recipients: string[];
  retention: string;
  revocable: string;
  required: boolean;
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

export interface AdminLocationView extends LocationView {
  nickname: string | null;
  realName: string | null;
}

export interface EmployeeSummary {
  id: string;
  nickname: string | null;
  role: string;
  createdAt: string;
  consentActive: boolean;
  lastReportAt: number | null;
  todayCheckins: number;
  hasPhone: boolean;
  hasRealname: boolean;
}

export interface ReportResult {
  id: string;
  withinGeofence: boolean;
  distanceM: number | null;
  address: string | null;
  recordedAt: number;
  note?: string;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
}
