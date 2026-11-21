import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import './styles/global.css';

// GitHub Pages 项目页部署在 /attendance-app/ 子路径下，Router 需去掉该前缀才能匹配 /login 等路由。
// 本地开发 BASE_URL 为 '/'，无需处理；规范化为无尾斜杠或 '/'.
const rawBase = import.meta.env.BASE_URL || '/';
const basename = rawBase === '/' ? '/' : rawBase.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
