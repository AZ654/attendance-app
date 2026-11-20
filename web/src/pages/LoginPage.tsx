import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

export function LoginPage() {
  const {
    user, devMode, passwordLoginEnabled, wechatConfigured,
    loginDev, loginPassword, loginByCode,
  } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      // 走统一 API 客户端：静态部署时会自动使用构建期注入的后端地址
      const res = await api.get<{ authUrl?: string | null }>('/auth/wechat/url', { skipAuth: true });
      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        setError('服务端未配置微信登录，请使用账号登录');
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取微信登录地址失败');
      setBusy(false);
    }
  };

  const handlePasswordLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await loginPassword(username.trim(), password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
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

  const showWechat = devMode === false && wechatConfigured;
  const showDev = devMode === true;

  return (
    <div className="app-shell">
      <div className="login-hero">
        <div className="big-icon">📍</div>
        <h2>员工考勤系统</h2>
        <p>基于本人授权的位置考勤 · 数据加密 · 可随时撤回</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {devMode === null && <div className="loading">检测登录方式...</div>}

      {/* 电脑端账号登录：账号由管理员在管理端创建，或用服务端命令行创建 */}
      {devMode !== null && passwordLoginEnabled && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>账号登录（电脑端）</h2>
          <label className="label">账号</label>
          <input
            className="input"
            placeholder="工号 / 账号"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordLogin(); }}
          />
          <label className="label mt16">密码</label>
          <input
            className="input"
            type="password"
            placeholder="密码"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordLogin(); }}
          />
          <button className="btn btn-block mt16" onClick={handlePasswordLogin} disabled={busy || !username.trim() || !password}>
            {busy ? '登录中...' : '登录'}
          </button>
          <p className="muted small mt8" style={{ textAlign: 'center' }}>
            账号由管理员分配；首次登录后仍需完成位置采集授权
          </p>
        </div>
      )}

      {showWechat && (
        <div className="card">
          <button className="btn btn-block" onClick={handleWechatLogin} disabled={busy}>
            微信登录（手机）
          </button>
          <p className="muted small mt8" style={{ textAlign: 'center' }}>
            将跳转微信授权，仅获取公开账号信息（昵称、头像）
          </p>
        </div>
      )}

      {showDev && (
        <div className="card">
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
        </div>
      )}

      {devMode !== null && !passwordLoginEnabled && !showWechat && !showDev && (
        <div className="alert alert-error">服务端未启用任何登录方式，请联系管理员。</div>
      )}

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
