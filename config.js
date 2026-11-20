/**
 * 运行时配置（部署后可直接修改本文件，无需重新构建前端）。
 *
 * apiBase：后端 API 根地址（含 /api）。
 *   - 本地开发：留空，前端走 Vite 代理的 /api
 *   - 云部署：填写后端服务的公网地址，例如 https://xxx.up.railway.app/api
 *
 * 当前值为临时隧道地址，后端迁移到 Railway 后请替换此值。
 */
window.__APP_CONFIG__ = {
  apiBase: 'https://236a56fe.r16.cpolar.top/api'
};
