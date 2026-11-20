import { initSchema, db } from './index.js';
import { logger } from '../lib/logger.js';

try {
  initSchema();
  logger.info('迁移完成');
} catch (err) {
  logger.error({ err }, '迁移失败');
  process.exitCode = 1;
} finally {
  db.close();
}
