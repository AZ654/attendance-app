export interface GeoResult {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  source: 'gps' | 'network';
  address?: string | null;
}

/** 通过浏览器 Geolocation API 获取精确位置（需用户浏览器授权一次）。 */
export function getGpsPosition(timeoutMs = 10000): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          source: 'gps',
        });
      },
      (err) => {
        const map: Record<number, string> = {
          1: '定位权限被拒绝，请在浏览器设置中允许位置访问',
          2: '无法获取位置信息',
          3: '定位超时，请重试',
        };
        reject(new Error(map[err.code] ?? '定位失败'));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/** 网络 IP 兜底定位服务，可通过 VITE_IP_GEO_URL 配置（默认公共免费服务）。 */
const IP_GEO_URL = import.meta.env.VITE_IP_GEO_URL || 'https://ipapi.co/json/';

/** 网络 IP 兜底定位：精度低（城市级），仅在 GPS 不可用时用于展示参考，不用于考勤判定。 */
export async function getNetworkPosition(): Promise<GeoResult | null> {
  try {
    const res = await fetch(IP_GEO_URL, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      latitude?: number; longitude?: number; city?: string; error?: boolean;
    };
    if (data.error || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyM: 50000,
      source: 'network',
      address: data.city ?? null,
    };
  } catch {
    return null;
  }
}

/** 多源定位：优先 GPS，失败则退回网络 IP（标注低精度）。 */
export async function resolvePosition(): Promise<GeoResult> {
  try {
    return await getGpsPosition();
  } catch (gpsErr) {
    const network = await getNetworkPosition();
    if (network) return network;
    throw gpsErr;
  }
}
