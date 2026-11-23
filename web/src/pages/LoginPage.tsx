import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

export function LoginPage() {
  const {
    user, devMode, passwordLoginEnabled, wechatConfigured,
    loginDev, loginPassword, loginByCode, startQrLogin, checkQrLogin,
  } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [devOpenid, setDevOpenid] = useState('');
  const [qr, setQr] = useState<{ state: string; authUrl: string; dataUrl: string } | null>(null);
  const [qrMessage, setQrMessage] = useState('');
  // 手机为电脑扫码授权成功后显示成功页，不进入考勤主界面
  const [qrAuthorized, setQrAuthorized] = useState(false);

  // 微信 OAuth 回调：URL 带 code 时用 code + state 登录
  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state') ?? undefined;
    if (!code || busy) return;
    (async () => {
      setBusy(true);
      setError('');
      try {
        const isQrGrant = await loginByCode(code, state);
        if (isQrGrant) {
          // 手机扫码为电脑授权：留在成功页，不登录手机、不跳转主界面
          setQrAuthorized(true);
          // 清掉 URL 中的一次性 code，防止刷新重复授权
          navigate('/login', { replace: true });
        } else {
          // replace 模式替换当前历史记录，URL 中的一次性 code 随之清除
          navigate('/', { replace: true });
        }
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

  // 电脑扫码：每 2 秒轮询授权结果，10 分钟后失效
  useEffect(() => {
    if (!qr) return;
    let active = true;
    const deadline = Date.now() + 10 * 60 * 1000;
    const timer = window.setInterval(async () => {
      if (!active) return;
      if (Date.now() > deadline) {
        window.clearInterval(timer);
        setQr(null);
        setError('二维码已过期，请重新获取');
        return;
      }
      try {
        const loggedIn = await checkQrLogin(qr.state);
        if (loggedIn) {
          window.clearInterval(timer);
          navigate('/', { replace: true });
        }
      } catch (e) {
        window.clearInterval(timer);
        setQr(null);
        setError(e instanceof Error ? e.message : '扫码登录失败，请重试');
      }
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [qr, checkQrLogin, navigate]);

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

  const handleQrLogin = async () => {
    setError('');
    setQr(null);
    setQrMessage('');
    setBusy(true);
    try {
      const session = await startQrLogin();
      const dataUrl = await QRCode.toDataURL(session.authUrl, {
        width: 240,
        margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      });
      setQr({ state: session.state, authUrl: session.authUrl, dataUrl });
      setQrMessage('请用手机微信扫码，并在手机上确认授权');
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取登录二维码失败');
    } finally {
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

  // 手机扫码授权完成：显示成功提示，等待电脑端自动登录
  if (qrAuthorized) {
    return (
      <div className="app-shell">
        <div className="login-hero">
          <div className="big-icon">✅</div>
          <h2>授权成功</h2>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 17, fontWeight: 600, margin: '16px 0' }}>登录成功</p>
          <p className="muted">你已在手机上完成微信授权，请返回电脑端查看，电脑将自动完成登录。</p>
          <p className="muted small mt8">此页面仅用于确认授权，手机无需再次操作。</p>
        </div>
      </div>
    );
  }

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

      {showWechat && !qr && (
        <div className="card">
          <button className="btn btn-block" onClick={handleWechatLogin} disabled={busy}>
            微信登录（手机）
          </button>
          <button className="btn btn-block mt8" onClick={handleQrLogin} disabled={busy}>
            {busy ? '生成二维码中...' : '微信扫码登录（电脑）'}
          </button>
          <p className="muted small mt8" style={{ textAlign: 'center' }}>
            电脑上点击「微信扫码登录」，用手机微信扫码确认后，电脑会自动登录
          </p>
        </div>
      )}

      {showWechat && qr && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>微信扫码登录</h2>
          <img
            src={qr.dataUrl}
            alt="微信登录二维码"
            style={{ width: 240, height: 240, maxWidth: '100%', borderRadius: 8 }}
          />
          <p className="muted small mt8">{qrMessage || '正在等待手机授权...'}</p>
          <p className="muted small">
            扫码后请在手机微信里点「同意授权」，电脑会自动完成登录。二维码 10 分钟内有效。
          </p>
          <button className="btn btn-block mt8" onClick={() => setQr(null)}>
            取消扫码
          </button>
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
