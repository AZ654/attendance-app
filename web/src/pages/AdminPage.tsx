import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AdminLocationView, EmployeeSummary } from '../types';

export function AdminPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [locations, setLocations] = useState<AdminLocationView[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, l] = await Promise.all([
        api.get<{ items: EmployeeSummary[] }>('/admin/employees'),
        api.get<{ items: AdminLocationView[] }>('/admin/locations?limit=50'),
      ]);
      setEmployees(e.items);
      setLocations(l.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败（需要管理员权限）');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = filter
    ? locations.filter((l) => l.nickname?.includes(filter) || l.realName?.includes(filter))
    : locations;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h2>员工概览</h2>
        {employees.length === 0 && <p className="muted small">暂无员工数据</p>}
        {employees.map((e) => (
          <div className="list-item" key={e.id}>
            <div className="spread">
              <b>{e.nickname ?? '未命名员工'}</b>
              <span className={`badge ${e.consentActive ? 'badge-ok' : 'badge-muted'}`}>
                {e.consentActive ? '已授权' : '未授权'}
              </span>
            </div>
            <div className="muted tiny mt8">
              今日出勤 {e.todayCheckins} 次 · 手机号 {e.hasPhone ? '已填' : '未填'} · 实名 {e.hasRealname ? '已填' : '未填'}
            </div>
            {e.lastReportAt && (
              <div className="muted tiny">最近上报：{new Date(e.lastReportAt).toLocaleString('zh-CN')}</div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>考勤位置记录</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}>刷新</button>
        </div>
        <input
          className="input mt16"
          placeholder="按姓名筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filtered.length === 0 && <p className="muted small mt16">暂无记录</p>}
        {filtered.map((l) => (
          <div className="list-item" key={l.id}>
            <div className="spread">
              <span className={`badge ${l.withinGeofence ? 'badge-ok' : 'badge-warn'}`}>
                {l.withinGeofence ? '范围内' : '范围外'}
              </span>
              <span className="muted tiny">{l.mode === 'auto' ? '自动' : '主动'} · {l.source}</span>
            </div>
            {l.address && <div className="small mt8">📍 {l.address}</div>}
            <div className="small mt8">
              {l.nickname ?? l.realName ?? '员工'} · 距点 {l.distanceM ?? '?'} 米
            </div>
            <div className="muted tiny">
              {new Date(l.recordedAt).toLocaleString('zh-CN')} · {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
