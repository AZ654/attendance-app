/**
 * 运行时配置（部署后可直接修改本文件，无需重新构建前端）。
 *
 * apiBase：后端 API 根地址（含 /api）。
 *   - 本地开发：留空，前端走 Vite 代理的 /api
 *   - 云部署：填写后端服务的公网地址，例如 https://xxx.up.railway.app/api
 *
 * 当前指向 Railway 云后端（固定域名，不再依赖本机隧道）。
 */
window.__APP_CONFIG__ = {
  apiBase: 'https://resilient-flexibility-production-150d04fe.up.railway.app/api'
};
