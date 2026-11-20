import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { user, devMode, loginDev, loginByCode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devOpenid, setDevOpenid] = useState('');

  // 微信 OAuth 回调：URL 带 code 时用 code + state 登录
  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state') ?? undefined;
    if (!code || busy) return;
    (async () => {
      setBusy(true);
      setError('');
      try {
        await loginByCode(code, state);
        // replace 模式替换当前历史记录，URL 中的一次性 code 随之清除
        navigate('/', { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : '微信登录失败');
      } finally {
        setBusy(false);
      }
    })();
  }, [params, loginByCode, navigate, busy]);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleWechatLogin = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/wechat/url').then((r) => r.json());
      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        setError('服务端未配置微信登录，请使用开发模式登录');
        setBusy(false);
      }
    } catch {
      setError('获取微信登录地址失败');
      setBusy(false);
    }
  };

  const handleDevLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await loginDev(devOpenid.trim() || undefined);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="login-hero">
        <div className="big-icon">📍</div>
        <h2>员工考勤系统</h2>
        <p>基于本人授权的位置考勤 · 数据加密 · 可随时撤回</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {devMode === false && (
          <>
            <button className="btn btn-block" onClick={handleWechatLogin} disabled={busy}>
              微信登录
            </button>
            <p className="muted small mt8" style={{ textAlign: 'center' }}>
              将跳转微信授权，仅获取公开账号信息（昵称、头像）
            </p>
          </>
        )}

        {devMode === true && (
          <>
            <div className="notice-box notice-warn">
              当前为开发模式：微信登录已用模拟身份替代，便于本地联调。生产环境请关闭 AUTH_DEV_MODE 并配置微信凭证。
            </div>
            <label className="label">模拟工号 / OpenID（可留空使用默认）</label>
            <input
              className="input"
              placeholder="例如 emp-001"
              value={devOpenid}
              onChange={(e) => setDevOpenid(e.target.value)}
            />
            <button className="btn btn-block mt16" onClick={handleDevLogin} disabled={busy}>
              {busy ? '登录中...' : '开发模式登录'}
            </button>
          </>
        )}

        {devMode === null && <div className="loading">检测登录方式...</div>}
      </div>

      <div className="notice-box">
        <b>隐私说明</b>
        <ul>
          <li>位置采集需要您单独授权，授权后可在工作时段自动上报，日常无需操作。</li>
          <li>实名信息与手机号均为自愿填写，加密存储、脱敏展示，可随时删除。</li>
          <li>授权与填报均可随时撤回，撤回后立即停止采集。</li>
        </ul>
      </div>
    </div>
  );
}
