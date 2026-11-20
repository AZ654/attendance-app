import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AdminLocationView, EmployeeSummary } from '../types';

export function AdminPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [locations, setLocations] = useState<AdminLocationView[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [account, setAccount] = useState({ username: '', password: '', nickname: '', role: 'employee' });
  const [accountBusy, setAccountBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [bindFor, setBindFor] = useState<string | null>(null);
  const [bindAccountName, setBindAccountName] = useState('');
  const [bindPassword, setBindPassword] = useState('');

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

  const createAccount = async () => {
    setError('');
    setMessage('');
    setAccountBusy(true);
    try {
      const created = await api.post<{ username: string }>('/admin/accounts', {
        username: account.username.trim(),
        password: account.password,
        nickname: account.nickname.trim() || undefined,
        role: account.role,
      });
      setMessage(`账号 ${created.username} 已创建，可在电脑端登录。`);
      setAccount({ username: '', password: '', nickname: '', role: 'employee' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建账号失败');
    } finally {
      setAccountBusy(false);
    }
  };

  const bindAccount = async (userId: string) => {
    setError('');
    setMessage('');
    setAccountBusy(true);
    try {
      const bound = await api.post<{ username: string }>(`/admin/accounts/${userId}/bind`, {
        username: bindAccountName.trim(),
        password: bindPassword,
      });
      setMessage(`已为该员工绑定电脑账号 ${bound.username}。`);
      setBindFor(null);
      setBindAccountName('');
      setBindPassword('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定账号失败');
    } finally {
      setAccountBusy(false);
    }
  };

  const resetAccountPassword = async (userId: string) => {
    setError('');
    setMessage('');
    setAccountBusy(true);
    try {
      await api.post(`/admin/accounts/${userId}/password`, { password: resetPassword });
      setMessage('密码已重置。');
      setResetFor(null);
      setResetPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setAccountBusy(false);
    }
  };

  const filtered = filter
    ? locations.filter((l) => l.nickname?.includes(filter) || l.realName?.includes(filter))
    : locations;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>创建电脑端账号</h2>
        <div className="spread">
          <input
            className="input"
            style={{ flex: 1, marginRight: 8 }}
            placeholder="账号（3-32 位字母数字）"
            value={account.username}
            onChange={(e) => setAccount({ ...account, username: e.target.value })}
          />
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="初始密码（至少 8 位）"
            type="password"
            value={account.password}
            onChange={(e) => setAccount({ ...account, password: e.target.value })}
          />
        </div>
        <div className="spread mt8">
          <input
            className="input"
            style={{ flex: 1, marginRight: 8 }}
            placeholder="显示名称（可选）"
            value={account.nickname}
            onChange={(e) => setAccount({ ...account, nickname: e.target.value })}
          />
          <select
            className="input"
            style={{ width: 120 }}
            value={account.role}
            onChange={(e) => setAccount({ ...account, role: e.target.value })}
          >
            <option value="employee">员工</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <button
          className="btn mt16"
          onClick={createAccount}
          disabled={accountBusy || !account.username.trim() || account.password.length < 8}
        >
          {accountBusy ? '处理中...' : '创建账号'}
        </button>
      </div>

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
            {!e.username && (
              <div className="mt8">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setBindFor(bindFor === e.id ? null : e.id); setBindAccountName(''); setBindPassword(''); }}
                >
                  绑定电脑账号
                </button>
                {bindFor === e.id && (
                  <div className="spread mt8">
                    <input
                      className="input"
                      style={{ flex: 1, marginRight: 8 }}
                      placeholder="账号"
                      value={bindAccountName}
                      onChange={(event) => setBindAccountName(event.target.value)}
                    />
                    <input
                      className="input"
                      style={{ flex: 1, marginRight: 8 }}
                      type="password"
                      placeholder="初始密码（至少 8 位）"
                      value={bindPassword}
                      onChange={(event) => setBindPassword(event.target.value)}
                    />
                    <button
                      className="btn btn-sm"
                      disabled={accountBusy || !bindAccountName.trim() || bindPassword.length < 8}
                      onClick={() => bindAccount(e.id)}
                    >
                      确认绑定
                    </button>
                  </div>
                )}
              </div>
            )}
            {e.username && (
              <div className="small mt8 spread">
                <span>电脑账号：{e.username}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setResetFor(resetFor === e.id ? null : e.id); setResetPassword(''); }}
                >
                  重置密码
                </button>
              </div>
            )}
            {resetFor === e.id && (
              <div className="spread mt8">
                <input
                  className="input"
                  style={{ flex: 1, marginRight: 8 }}
                  type="password"
                  placeholder="新密码（至少 8 位）"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                />
                <button
                  className="btn btn-sm"
                  disabled={accountBusy || resetPassword.length < 8}
                  onClick={() => resetAccountPassword(e.id)}
                >
                  确认重置
                </button>
              </div>
            )}
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
