import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { ProfileView } from '../types';

interface SendResult {
  expiresIn: number;
  devCode?: string;
  devMode: boolean;
}

/** 仿微信「申请获取并验证你的手机号」授权弹层。手机号由本人输入 + 短信验证码核验。 */
export function PhoneBindSheet() {
  const { user, dismissPhoneBind, refreshUser, logout } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.get<{ phone: string; note: string }>('/users/purpose')
      .then((n) => setNotice(n.phone))
      .catch(() => setNotice('手机号仅用于考勤异常时联系本人，加密存储、脱敏展示，可随时撤回。'));
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  const startCountdown = (seconds: number) => {
    setCountdown(seconds);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { if (timer.current) window.clearInterval(timer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const send = async () => {
    setErr('');
    if (!/^1[3-9]\d{9}$/.test(phone)) { setErr('请输入正确的 11 位手机号'); return; }
    setBusy(true);
    try {
      const res = await api.post<SendResult>('/sms/send-code', { phone });
      setSent(true);
      setDevCode(res.devCode ?? '');
      startCountdown(res.expiresIn < 60 ? 60 : res.expiresIn);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '验证码发送失败');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setErr('');
    if (!/^\d{6}$/.test(code)) { setErr('请输入 6 位短信验证码'); return; }
    setBusy(true);
    try {
      const profile = await api.post<ProfileView>('/users/me/phone', { phone, code, consent: true });
      // 绑定成功后同步最新资料，使「我的」页联系方式自动显示
      if (profile.hasPhone) await refreshUser().catch(() => {});
      dismissPhoneBind();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '绑定失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wx-auth-mask" role="dialog" aria-modal="true">
      <div className="wx-auth-top">
        <div className="wx-app-icon">✓</div>
        <div className="wx-app-name">员工考勤</div>
      </div>
      <div className="wx-sheet">
        <div className="wx-sheet-head">
          <div className="wx-avatar">{user?.nickname?.slice(0, 1) ?? '员'}</div>
          <div className="wx-app-title">员工考勤</div>
          <button className="wx-info" aria-label="说明" title={notice}>i</button>
        </div>

        <h3 className="wx-sheet-title">申请获取并验证你的手机号</h3>
        <p className="wx-sheet-desc">
          进入考勤系统前需完成手机号验证，用于考勤异常时联系本人。手机号加密存储、脱敏展示，绑定后可在「我的」页撤回。
        </p>

        <div className="wx-phone-box">
          <label className="wx-field-label">本人手机号</label>
          <input
            className="wx-phone-input"
            inputMode="numeric"
            maxLength={11}
            placeholder="请输入 11 位手机号"
            value={phone}
            onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setSent(false); setDevCode(''); }}
          />
          <div className="wx-code-row">
            <input
              className="wx-code-input"
              inputMode="numeric"
              maxLength={6}
              placeholder="6 位短信验证码"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="wx-send-btn"
              onClick={send}
              disabled={busy || countdown > 0 || !/^1[3-9]\d{9}$/.test(phone)}
            >
              {countdown > 0 ? `${countdown}s 后重发` : sent ? '重新发送' : '获取验证码'}
            </button>
          </div>
          {devCode && (
            <p className="wx-dev-code">开发模式验证码：<b>{devCode}</b>（生产配置短信密钥后不会有此提示）</p>
          )}
          {sent && !devCode && <p className="wx-sent-tip">验证码已发送，请在 5 分钟内填写</p>}
          {err && <p className="wx-error">{err}</p>}
        </div>

        <button className="wx-allow-btn" onClick={confirm} disabled={busy}>
          {busy ? '处理中...' : '验证并进入考勤系统'}
        </button>
        <button className="wx-deny-btn" onClick={() => void logout()} disabled={busy}>退出登录</button>
        <p className="wx-footnote">绑定手机号后方可进入主界面；手机号由本人填写并验证，非自动从微信读取</p>
      </div>
    </div>
  );
}
