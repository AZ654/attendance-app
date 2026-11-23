import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { ProfileView } from '../types';

const EMPTY: ProfileView = {
  hasPhone: false, phoneMasked: null, hasRealname: false, realName: null,
  idCardMasked: null, phoneConsentAt: null, realnameConsentAt: null, updatedAt: null,
};

export function ProfilePage() {
  const { user, logout, refreshUser, requirePhoneBind } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileView>(EMPTY);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneDevCode, setPhoneDevCode] = useState('');
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const phoneTimer = useRef<number | null>(null);
  useEffect(() => () => { if (phoneTimer.current) window.clearInterval(phoneTimer.current); }, []);
  const [notice, setNotice] = useState<{ phone: string; realname: string; note: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // 表单
  const [phone, setPhone] = useState('');
  const [phoneAgree, setPhoneAgree] = useState(false);
  const [realName, setRealName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [realAgree, setRealAgree] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, n] = await Promise.all([
        api.get<ProfileView>('/users/me/profile'),
        api.get<{ phone: string; realname: string; note: string }>('/users/purpose'),
      ]);
      setProfile(p);
      setNotice(n);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '加载失败');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sendPhoneCode = async () => {
    setMsg('');
    if (!/^1[3-9]\d{9}$/.test(phone)) { setMsg('请输入正确的 11 位手机号'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ expiresIn: number; devCode?: string }>('/sms/send-code', { phone });
      setPhoneDevCode(res.devCode ?? '');
      setPhoneCountdown(res.expiresIn < 60 ? 60 : res.expiresIn);
      if (phoneTimer.current) window.clearInterval(phoneTimer.current);
      phoneTimer.current = window.setInterval(() => {
        setPhoneCountdown((c) => {
          if (c <= 1) { if (phoneTimer.current) window.clearInterval(phoneTimer.current); return 0; }
          return c - 1;
        });
      }, 1000);
      setMsg(res.devCode ? `开发模式验证码：${res.devCode}` : '验证码已发送，请在 5 分钟内填写');
    } catch (e) { setMsg(e instanceof Error ? e.message : '验证码发送失败'); }
    finally { setBusy(false); }
  };

  const savePhone = async () => {
    if (!/^\d{6}$/.test(phoneCode)) { setMsg('请输入 6 位短信验证码'); return; }
    setBusy(true); setMsg('');
    try {
      await api.post('/users/me/phone', { phone, code: phoneCode, consent: true });
      setMsg('手机号已保存'); setPhone(''); setPhoneCode(''); setPhoneDevCode(''); setPhoneAgree(false);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  };

  const saveRealname = async () => {
    setBusy(true); setMsg('');
    try {
      await api.post('/users/me/realname', { realName, idCard, consent: true });
      setMsg('实名信息已保存'); setRealName(''); setIdCard(''); setRealAgree(false);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  };

  const clearP = async (kind: 'phone' | 'realname') => {
    setBusy(true); setMsg('');
    try {
      await api.del(`/users/me/${kind}`);
      setMsg(kind === 'phone' ? '手机号已删除' : '实名信息已删除');
      await load();
      // 微信账号删除手机号后失去进入资格，立即重新拦截
      if (kind === 'phone') await requirePhoneBind();
    } catch (e) { setMsg(e instanceof Error ? e.message : '删除失败'); }
    finally { setBusy(false); }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div className="card">
        <h2>登录账号信息</h2>
        <div className="kv"><span className="k">昵称</span><span className="v">{user?.nickname ?? '未设置'}</span></div>
        <div className="kv"><span className="k">角色</span><span className="v">{user?.role === 'admin' ? '管理员' : '员工'}</span></div>
        <div className="kv"><span className="k">OpenID</span><span className="v tiny">{user?.openid}</span></div>
        <div className="kv"><span className="k">注册时间</span><span className="v tiny">{user ? new Date(user.createdAt).toLocaleString('zh-CN') : ''}</span></div>
        <button className="btn btn-ghost btn-block btn-sm mt16" onClick={() => refreshUser().catch(() => {})}>
          刷新账号信息
        </button>
      </div>

      {msg && <div className="alert alert-error">{msg}</div>}

      <div className="card">
        <h2>联系方式（自愿填写）</h2>
        {notice && <div className="notice-box small">{notice.phone}</div>}
        {notice && <div className="notice-box notice-warn small mt8">{notice.note}</div>}
        {profile.hasPhone ? (
          <>
            <div className="kv mt16"><span className="k">手机号</span><span className="v">{profile.phoneMasked}</span></div>
            <button className="btn btn-danger btn-sm mt16" onClick={() => clearP('phone')} disabled={busy}>
              删除手机号
            </button>
          </>
        ) : (
          <>
            <label className="label">手机号</label>
            <input className="input" inputMode="numeric" maxLength={11} placeholder="11 位手机号" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setPhoneDevCode(''); }} />
            <label className="label mt8">短信验证码</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" inputMode="numeric" maxLength={6} placeholder="6 位验证码" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))} />
              <button className="btn btn-sm" disabled={busy || phoneCountdown > 0 || !/^1[3-9]\d{9}$/.test(phone)} onClick={sendPhoneCode} style={{ whiteSpace: 'nowrap' }}>
                {phoneCountdown > 0 ? `${phoneCountdown}s` : '获取验证码'}
              </button>
            </div>
            {phoneDevCode && <div className="notice-box notice-warn small mt8">开发模式验证码：{phoneDevCode}</div>}
            <label className="checkbox-row">
              <input type="checkbox" checked={phoneAgree} onChange={(e) => setPhoneAgree(e.target.checked)} />
              <span>我已阅读用途说明，自愿填写并同意加密存储、脱敏展示，可随时删除。</span>
            </label>
            <button className="btn btn-block btn-sm" disabled={!phoneAgree || !/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(phoneCode) || busy} onClick={savePhone}>
              验证并保存手机号
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>实名信息（自愿填写）</h2>
        {notice && <div className="notice-box small">{notice.realname}</div>}
        {profile.hasRealname ? (
          <>
            <div className="kv mt16"><span className="k">姓名</span><span className="v">{profile.realName}</span></div>
            <div className="kv"><span className="k">身份证号</span><span className="v">{profile.idCardMasked}</span></div>
            <button className="btn btn-danger btn-sm mt16" onClick={() => clearP('realname')} disabled={busy}>
              删除实名信息
            </button>
          </>
        ) : (
          <>
            <label className="label">姓名</label>
            <input className="input" placeholder="真实姓名" value={realName} onChange={(e) => setRealName(e.target.value)} />
            <label className="label">身份证号</label>
            <input className="input" placeholder="18 位身份证号" value={idCard} onChange={(e) => setIdCard(e.target.value)} />
            <label className="checkbox-row">
              <input type="checkbox" checked={realAgree} onChange={(e) => setRealAgree(e.target.checked)} />
              <span>我已阅读用途说明，自愿填写。身份证号将加密存储、仅脱敏展示，可随时删除。</span>
            </label>
            <button className="btn btn-block btn-sm" disabled={!realAgree || !realName || !idCard || busy} onClick={saveRealname}>
              保存实名信息
            </button>
          </>
        )}
      </div>

      <button className="btn btn-ghost btn-block" onClick={handleLogout}>退出登录</button>
    </>
  );
}
