import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string; // user id
  role: 'employee' | 'admin';
  openid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // 刷新令牌唯一标识，服务端存储用于吊销
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'attendance-app',
    audience: 'attendance-web',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'attendance-app',
    audience: 'attendance-web',
  }) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'attendance-app',
    audience: 'attendance-web-refresh',
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, {
    issuer: 'attendance-app',
    audience: 'attendance-web-refresh',
  }) as RefreshTokenPayload;
}
