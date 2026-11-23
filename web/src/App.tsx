import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ConsentPage } from './pages/ConsentPage';
import { CheckinPage } from './pages/CheckinPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { PhoneBindSheet } from './components/PhoneBindSheet';

function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
      正在加载...
    </div>
  );
}

/** 路由守卫：未登录跳转登录页；微信账号未绑定手机号时只显示绑定弹层。 */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, needPhoneBind } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (needPhoneBind) return <PhoneBindSheet />;
  return <>{children}</>;
}

export default function App() {
  const { loading, needPhoneBind } = useAuth();
  if (loading) return <Loading />;
  // 微信账号未完成手机号绑定：全局只渲染绑定弹层，屏蔽所有主界面路由
  if (needPhoneBind) return <PhoneBindSheet />;

  return (
    <>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout>
              <CheckinPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/consent"
        element={
          <Protected>
            <Layout>
              <ConsentPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <Layout>
              <ProfilePage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <Layout>
              <AdminPage />
            </Layout>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
