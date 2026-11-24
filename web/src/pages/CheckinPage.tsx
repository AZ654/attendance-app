import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { resolvePosition, type GeoResult } from '../lib/geo';
import type { ConsentView, LocationView, ReportResult } from '../types';

type Phase = 'idle' | 'locating' | 'reporting' | 'done' | 'error';

export function CheckinPage() {
  const [consent, setConsent] = useState<ConsentView | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<LocationView[]>([]);
  const autoTimer = useRef<number | null>(null);
  // 上次成功上报的时间戳，用于"切回前台补打卡"判断是否漏打
  const lastReportAt = useRef<number>(0);
  // 并发锁：防止定时器与 visibilitychange 同一瞬间触发导致重复上报
  const inFlight = useRef(false);

  const loadConsent = useCallback(async () => {
    const mine = await api.get<{ consent: ConsentView | null }>('/consent/mine');
    setConsent(mine.consent);
  }, []);

  const loadHistory = useCallback(async () => {
    const data = await api.get<{ items: LocationView[] }>('/locations/mine?limit=10');
    setHistory(data.items);
  }, []);

  useEffect(() => {
    loadConsent().catch(() => {});
    loadHistory().catch(() => {});
  }, [loadConsent, loadHistory]);

  /** 执行一次上报。active=用户主动；auto=授权后自动。任何定位打卡都会落库并发邮件。 */
  const doReport = useCallback(async (mode: 'active' | 'auto') => {
    // 并发锁：一次只允许一个定位上报在飞，避免重复打卡刷屏
    if (inFlight.current) return;
    inFlight.current = true;
    if (mode === 'active') setPhase('locating');
    setError('');
    try {
      const pos = await resolvePosition();
      setGeo(pos);
      setPhase('reporting');
      const res = await api.post<ReportResult>('/locations/report', {
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyM: pos.accuracyM,
        source: pos.source,
        mode,
        address: pos.address ?? null,
      });
      setResult(res);
      setPhase('done');
      lastReportAt.current = Date.now();
      loadHistory().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '打卡失败');
      setPhase('error');
    } finally {
      inFlight.current = false;
    }
  }, [loadHistory]);

  /**
   * 授权后自动上报。浏览器在页面切到后台时会冻结定时器并禁止获取 GPS，
   * 因此纯网页无法在后台真正持续打卡。策略：
   *   1) 页面可见时每 5 分钟自动上报一次；
   *   2) 用户切回前台（visibilitychange / pageshow）时，若距上次成功上报已超过 5 分钟，
   *      立即补一次卡——保证"只要人在用页面，打卡就不会断"，不伪造后台时间段的位置。
   */
  useEffect(() => {
    if (!consent?.active) {
      if (autoTimer.current) { window.clearInterval(autoTimer.current); autoTimer.current = null; }
      return;
    }

    const AUTO_INTERVAL = 5 * 60 * 1000;
    const tick = () => {
      // 只有页面处于可见状态才尝试；后台拿不到 GPS，硬打只会失败或落到低精度 IP 定位
      if (document.visibilityState !== 'visible') return;
      doReport('auto').catch(() => {});
    };
    // 进入时先上报一次
    tick();
    autoTimer.current = window.setInterval(tick, AUTO_INTERVAL);

    // 切回前台补打卡：距上次成功上报超过一个周期就补一次
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastReportAt.current >= AUTO_INTERVAL) {
        doReport('auto').catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      if (autoTimer.current) { window.clearInterval(autoTimer.current); autoTimer.current = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [consent?.active, doReport]);

  return (
    <>
      {result && phase === 'done' && (
        <div className={`status-banner ${result.withinGeofence ? 'status-ok' : 'status-out'}`}>
          <span className="big">{result.withinGeofence ? '✅ 打卡成功' : '⚠️ 范围外打卡'}</span>
          {result.address && <span className="address-line">📍 {result.address}</span>}
          <span className="small">
            {result.withinGeofence ? '您位于考勤范围内' : '您当前位置超出考勤范围，记录已上报'} · 距考勤点 {result.distanceM ?? '?'} 米
          </span>
        </div>
      )}

      <div className="card">
        <h2>位置打卡</h2>

        {!consent?.active && (
          <div className="alert alert-error">
            尚未完成位置采集授权。请先在「授权」页确认授权后，才能进行打卡与自动上报。
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {phase === 'locating' && (
          <div className="notice-box">📡 正在获取位置，请在浏览器弹窗中允许位置访问...</div>
        )}
        {phase === 'reporting' && (
          <div className="notice-box">⏳ 正在提交考勤记录...</div>
        )}

        {geo && (
          <div className="notice-box">
            <b>当前定位</b>
            {(result?.address || geo.address) && (
              <div className="small mt8">📍 {result?.address || geo.address}</div>
            )}
            <div className="small mt8">
              来源：{geo.source === 'gps' ? 'GPS 精确定位' : '网络定位（精度较低，仅供参考）'}
              {' · '}精度：{geo.accuracyM ? `${Math.round(geo.accuracyM)} 米` : '未知'}
            </div>
            <div className="small">坐标：{geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}</div>
            {geo.source === 'network' && (
              <div className="small mt8" style={{ color: '#b45309' }}>
                网络定位精度不足以用于正式考勤，请允许浏览器定位以获取准确位置。
              </div>
            )}
          </div>
        )}

        <button
          className="btn btn-block mt16"
          disabled={!consent?.active || phase === 'locating' || phase === 'reporting'}
          onClick={() => { setResult(null); doReport('active'); }}
        >
          {phase === 'locating' || phase === 'reporting' ? '处理中...' : '📍 立即打卡（主动上报）'}
        </button>
        <p className="muted small mt8" style={{ textAlign: 'center' }}>
          页面保持打开时每 5 分钟自动上报；切到后台浏览器会暂停定位，回到本页会立即补打卡。每次定位打卡都会发送邮件通知
        </p>
      </div>

      <div className="card">
        <h2>最近打卡记录</h2>
        {history.length === 0 && <p className="muted small">暂无记录</p>}
        {history.map((h) => (
          <div className="list-item" key={h.id}>
            <div className="spread">
              <span className={h.withinGeofence ? 'badge badge-ok' : 'badge badge-warn'}>
                {h.withinGeofence ? '范围内' : '范围外'}
              </span>
              <span className="muted tiny">{h.mode === 'auto' ? '自动' : '主动'} · {h.source}</span>
            </div>
            {h.address && <div className="small mt8">📍 {h.address}</div>}
            <div className="muted tiny mt8">
              {new Date(h.recordedAt).toLocaleString('zh-CN')} · 距点 {h.distanceM ?? '?'} 米
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
