import type { RequestHandler } from 'express';
import { logger } from '../../lib/logger.js';
import * as service from './locations.service.js';

export const report: RequestHandler = async (req, res) => {
  const body = req.body as {
    latitude: number; longitude: number; accuracyM?: number | null;
    source: 'gps' | 'network' | 'manual'; mode: 'active' | 'auto'; address?: string | null;
  };
  const result = await service.reportLocation({
    userId: req.auth!.sub,
    latitude: body.latitude,
    longitude: body.longitude,
    accuracyM: body.accuracyM,
    source: body.source,
    mode: body.mode,
    address: body.address,
  });
  logger.info(
    { userId: req.auth!.sub, locationId: result.id, within: result.withinGeofence, mode: body.mode },
    '位置上报成功',
  );
  res.status(201).json(result);
};

export const listMine: RequestHandler = (req, res) => {
  const { limit, offset } = req.query as unknown as { limit: number; offset: number };
  res.json({
    items: service.listMyLocations(req.auth!.sub, limit, offset),
    limit,
    offset,
  });
};
