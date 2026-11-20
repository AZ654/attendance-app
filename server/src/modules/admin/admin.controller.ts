import type { RequestHandler } from 'express';
import * as service from './admin.service.js';

export const employees: RequestHandler = (_req, res) => {
  res.json({ items: service.listEmployees() });
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
