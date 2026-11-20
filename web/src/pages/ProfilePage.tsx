import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { ProfileView } from '../types';

const EMPTY: ProfileView = {
  hasPhone: false, phoneMasked: null, hasRealname: false, realName: null,
  idCardMasked: null, phoneConsentAt: null, realnameConsentAt: null, updatedAt: null,
};

export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileView>(EMPTY);
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

  const savePhone = async () => {
    setBusy(true); setMsg('');
    try {
      await api.post('/users/me/phone', { phone, consent: true });
      setMsg('手机号已保存'); setPhone(''); setPhoneAgree(false);
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
            <input className="input" placeholder="11 位手机号" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <label className="checkbox-row">
              <input type="checkbox" checked={phoneAgree} onChange={(e) => setPhoneAgree(e.target.checked)} />
              <span>我已阅读用途说明，自愿填写并同意加密存储、脱敏展示，可随时删除。</span>
            </label>
            <button className="btn btn-block btn-sm" disabled={!phoneAgree || !phone || busy} onClick={savePhone}>
              保存手机号
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
