import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { resolvePosition } from '../lib/geo';
import type { ConsentNotice, ConsentView, ReportResult } from '../types';

type CapturePhase = 'idle' | 'locating' | 'done' | 'error';

export function ConsentPage() {
  const [notice, setNotice] = useState<ConsentNotice | null>(null);
  const [consent, setConsent] = useState<ConsentView | null>(null);
  const [history, setHistory] = useState<ConsentView[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // 授权后立即采集的状态
  const [capturePhase, setCapturePhase] = useState<CapturePhase>('idle');
  const [captureResult, setCaptureResult] = useState<ReportResult | null>(null);
  const [captureError, setCaptureError] = useState('');

  const load = useCallback(async () => {
    try {
      const [n, mine, hist] = await Promise.all([
        api.get<ConsentNotice>('/consent/notice'),
        api.get<{ consent: ConsentView | null }>('/consent/mine'),
        api.get<{ items: ConsentView[] }>('/consent/history'),
      ]);
      setNotice(n);
      setConsent(mine.consent);
      setHistory(hist.items);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGrant = async () => {
    setBusy(true); setMsg('');
    setCapturePhase('idle'); setCaptureResult(null); setCaptureError('');
    try {
      await api.post('/consent/grant', { acknowledged: true });
      setAck(false);
      await load();
      setMsg('✅ 授权成功');

      // 授权后立即采集一次位置（浏览器会请求定位权限，员工已在授权中同意）
      setCapturePhase('locating');
      try {
        const pos = await resolvePosition();
        const res = await api.post<ReportResult>('/locations/report', {
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracyM: pos.accuracyM,
          source: pos.source,
          mode: 'active',
          address: pos.address ?? null,
        });
        if (res.note) {
          // 非工作时段被服务端拦截，仍视为采集到的位置但未落库
          setCaptureError(`当前非工作时段，位置未计入考勤记录（${res.note}）`);
          setCapturePhase('error');
        } else {
          setCaptureResult(res);
          setCapturePhase('done');
          setMsg('✅ 授权成功，已完成首次位置采集');
        }
      } catch (e) {
        // 定位失败不回滚已生效的授权，仅提示可稍后手动重试
        setCaptureError(e instanceof Error ? e.message : '位置采集失败');
        setCapturePhase('error');
        setMsg('✅ 授权成功，但首次位置采集未完成，可在「打卡」页手动重试');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '授权失败');
    } finally { setBusy(false); }
  };

  const handleRevoke = async () => {
    setBusy(true); setMsg('');
    setCapturePhase('idle'); setCaptureResult(null); setCaptureError('');
    try {
      await api.post('/consent/revoke');
      setMsg('已撤回授权，位置采集已停止');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '撤回失败');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card">
        <h2>位置采集授权</h2>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="muted small">当前状态</span>
          {consent?.active
            ? <span className="badge badge-ok">已授权 · 采集中</span>
            : <span className="badge badge-muted">未授权</span>}
        </div>

        {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{msg}</div>}

        {notice && (
          <div className="notice-box">
            <b>{notice.title}</b>
            <ul>
              <li><b>目的：</b>{notice.purpose}</li>
              <li><b>范围：</b>{notice.scope}</li>
              <li><b>工作时段：</b>{notice.workWindow}（仅此时段自动上报）</li>
              <li><b>通知接收：</b>{notice.recipients.join('、')}</li>
              <li><b>撤回方式：</b>{notice.revocable}</li>
            </ul>
          </div>
        )}

        {!consent?.active ? (
          <>
            <label className="checkbox-row">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>我已阅读并理解上述告知内容，<b>自愿同意</b>在工作时段内采集并上报本人位置用于考勤。</span>
            </label>
            <button className="btn btn-block" disabled={!ack || busy} onClick={handleGrant}>
              {busy ? (capturePhase === 'locating' ? '采集中...' : '提交中...') : '确认授权并立即采集'}
            </button>
          </>
        ) : (
          <>
            <div className="kv mt16"><span className="k">授权编号</span><span className="v tiny">{consent?.id}</span></div>
            <div className="kv"><span className="k">授权时间</span><span className="v">{consent ? new Date(consent.grantedAt).toLocaleString('zh-CN') : ''}</span></div>

            {/* 授权后立即采集一次的结果反馈 */}
            {capturePhase === 'locating' && (
              <div className="notice-box mt16">📡 正在采集首次位置，请在浏览器弹窗中允许位置访问...</div>
            )}
            {capturePhase === 'done' && captureResult && (
              <div className={`status-banner ${captureResult.withinGeofence ? 'status-ok' : 'status-out'} mt16`}>
                <span className="big">{captureResult.withinGeofence ? '✅ 首次采集成功' : '⚠️ 首次采集：范围外'}</span>
                {captureResult.address && <span className="address-line">📍 {captureResult.address}</span>}
                <span className="small">
                  {captureResult.withinGeofence ? '位于考勤范围内' : '超出考勤范围，记录已上报'} · 距考勤点 {captureResult.distanceM ?? '?'} 米
                </span>
              </div>
            )}
            {capturePhase === 'error' && captureError && (
              <div className="alert alert-error mt16">{captureError}</div>
            )}

            <button className="btn btn-danger btn-block mt16" onClick={handleRevoke} disabled={busy || capturePhase === 'locating'}>
              撤回授权（立即停止采集）
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>授权历史</h2>
        {history.length === 0 && <p className="muted small">暂无记录</p>}
        {history.map((h) => (
          <div className="list-item" key={h.id}>
            <div className="spread">
              <span>{new Date(h.grantedAt).toLocaleString('zh-CN')}</span>
              <span className={`badge ${h.active ? 'badge-ok' : 'badge-muted'}`}>
                {h.active ? '生效中' : '已撤回'}
              </span>
            </div>
            <div className="muted tiny mt8">版本 v{h.id.slice(0, 6)} · {h.workStart}-{h.workEnd}</div>
          </div>
        ))}
      </div>
    </>
  );
}
