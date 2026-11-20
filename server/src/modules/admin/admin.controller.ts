import type { RequestHandler } from 'express';
import * as service from './admin.service.js';
import * as authService from '../auth/auth.service.js';

export const employees: RequestHandler = (_req, res) => {
  res.json({ items: service.listEmployees() });
};

/** 管理员创建电脑端账号。 */
export const createAccount: RequestHandler = (req, res) => {
  const { username, password, nickname, role } = req.body as {
    username: string; password: string; nickname?: string; role?: 'employee' | 'admin';
  };
  res.status(201).json(authService.createLocalAccount({ username, password, nickname, role }));
};

/** 管理员给已有员工绑定电脑端账号（微信用户也可绑定）。 */
export const bindAccount: RequestHandler = (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  res.json(authService.bindLocalCredentials(String(req.params.id), username, password));
};

/** 管理员重置账号密码。 */
export const resetAccountPassword: RequestHandler = (req, res) => {
  const { password } = req.body as { password: string };
  res.json(authService.resetAccountPassword(String(req.params.id), password));
};

export const locations: RequestHandler = (req, res) => {
  const { limit, offset } = req.query as unknown as { limit: number; offset: number };
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  res.json({
    items: service.listAllLocations(limit, offset, userId),
    limit,
    offset,
  });
};
