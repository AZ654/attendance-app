import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo">✓</div>
        <div>
          <h1>员工考勤</h1>
          <div className="sub">
            {user?.nickname ?? '员工'} · {isAdmin ? '管理员' : '员工'}
          </div>
        </div>
      </header>

      {children}

      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon">📍</span>打卡
        </NavLink>
        <NavLink to="/consent" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon">🔐</span>授权
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon">👤</span>我的
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">📊</span>管理
          </NavLink>
        )}
      </nav>
    </div>
  );
}
