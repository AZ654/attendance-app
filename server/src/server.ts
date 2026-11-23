import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { db } from './db/index.js';
import { startMailWorker, stopMailWorker } from './jobs/mailer.js';

const BUILD_TAG = '2026-11-23-qr-login';
const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, devMode: config.isDevMode, build: BUILD_TAG },
    '服务已启动'
  );
  startMailWorker();
});

let shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '开始优雅停机');
  stopMailWorker();
  server.close(() => {
    db.close();
    logger.info('服务已安全关闭');
    process.exit(0);
  });
  // 兜底：8 秒后强制退出
  const force = setTimeout(() => {
    logger.warn('优雅停机超时，强制退出');
    process.exit(1);
  }, 8000);
  force.unref?.();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  logger.error({ err }, '未处理的 Promise 拒绝');
});
