/**
 * 回填历史打卡记录缺失的地址（高德地图逆地理编码）。
 * 地址是上报时解析的，历史记录不会自动补；此脚本对 address 为空的记录
 * 重新调用逆地理编码并写回。相同坐标命中缓存，只消耗一次配额。
 *
 * 用法：npx tsx tests/backfill-address.ts
 */
import { db } from '../src/db/index.js';
import { reverseGeocode } from '../src/lib/geocoder.js';
import { logger } from '../src/lib/logger.js';

interface Row {
  id: string;
  latitude: number;
  longitude: number;
}

const rows = db
  .prepare('SELECT id, latitude, longitude FROM locations WHERE address IS NULL OR address = ? ORDER BY recorded_at DESC')
  .all('') as unknown as Row[];

if (rows.length === 0) {
  logger.info('没有需要回填的记录');
  process.exit(0);
}
logger.info({ count: rows.length }, '开始回填地址（脚本幂等，可随时重跑）');

let filled = 0;
let failed = 0;
for (const row of rows) {
  try {
    const address = await reverseGeocode(row.latitude, row.longitude);
    if (address) {
      db.prepare('UPDATE locations SET address = ? WHERE id = ?').run(address, row.id);
      filled++;
      logger.info({ id: row.id, address }, '回填成功');
    } else {
      failed++;
      logger.warn({ id: row.id }, '地址解析返回空');
    }
  } catch (err) {
    failed++;
    logger.warn({ id: row.id, err: String(err) }, '回填失败');
  }
}

logger.info({ filled, failed }, '回填完成');
if (failed > 0) {
  logger.warn('有记录未回填成功。若因配额耗尽（status 121），请稍后或次日重跑本脚本；幂等处理不会重复填充。');
}
db.close();
