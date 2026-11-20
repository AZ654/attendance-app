import { createHash } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from './logger.js';
import { wgs84ToGcj02 } from './coord.js';

interface AmapRegeoResponse {
  status: string; // 高德：'1' 成功，'0' 失败
  info: string;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: {
      province?: string;
      city?: string;
      district?: string;
      township?: string;
      streetNumber?: { street?: string | never[]; number?: string | never[] };
    };
  };
}

// 简单 TTL 缓存：坐标（5 位小数）→ 地址。避免重复调用消耗配额。
const CACHE_TTL = 6 * 3600 * 1000; // 6 小时
const cache = new Map<string, { value: string; expires: number }>();

/**
 * 高德 WebService 数字签名（纯函数，便于测试）。
 * 规则（官方）：所有请求参数（含 key）按参数名升序拼成 `k=v&...`，末尾直接拼接私钥，取 MD5(utf-8, 小写)。
 * 私钥未配置时返回 null，表示 key 未开通数字签名，走无签名调用。
 */
export function computeAmapSignature(params: Record<string, string>, secret: string): string | null {
  if (!secret) return null;
  const raw = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('md5').update(raw + secret, 'utf8').digest('hex').toLowerCase();
}

/** 把高德地址元素拼成可读地址。导出供测试。 */
export function formatAmapAddress(r: NonNullable<AmapRegeoResponse['regeocode']>): string {
  const comp = r.addressComponent ?? {};
  const street = comp.streetNumber;
  const streetText = typeof street?.street === 'string' ? street.street : '';
  const numberText = typeof street?.number === 'string' ? street.number : '';
  const parts = [
    comp.province,
    comp.city,
    comp.district,
    comp.township,
    streetText,
    numberText,
  ]
    .filter((p): p is string => Boolean(p && typeof p === 'string'))
    .join('');
  return (parts || r.formatted_address || '').replace(/[<>&"']/g, '').trim();
}

/** 逆地理编码：把经纬度解析成具体地址。失败返回 null，绝不影响打卡主流程。 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!config.geoReverseEnabled) return null;

  // 统一转换为 GCJ-02（高德地图要求）
  const coord = config.GEO_INPUT_COORD === 'wgs84' ? wgs84ToGcj02(lng, lat) : { lng, lat };
  const cacheKey = `${coord.lat.toFixed(5)},${coord.lng.toFixed(5)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    // 高德坐标顺序：经度在前、纬度在后（与腾讯相反）
    const location = `${coord.lng.toFixed(6)},${coord.lat.toFixed(6)}`;
    const params: Record<string, string> = { key: config.AMAP_KEY, location };
    const sig = computeAmapSignature(params, config.AMAP_SECRET);
    if (sig) params.sig = sig;

    const url = new URL('https://restapi.amap.com/v3/geocode/regeo');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as AmapRegeoResponse;
    if (data.status !== '1' || !data.regeocode) {
      logger.warn({ status: data.status, info: data.info }, '逆地理编码返回异常');
      return null;
    }

    const address = formatAmapAddress(data.regeocode);
    if (!address) return null;

    cache.set(cacheKey, { value: address, expires: Date.now() + CACHE_TTL });
    // 防止缓存无限增长
    if (cache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
    }
    return address;
  } catch (err) {
    logger.warn({ err: String(err) }, '逆地理编码失败，地址将留空');
    return null;
  }
}
