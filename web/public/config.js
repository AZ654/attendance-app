/**
 * 运行时配置（部署后可直接修改本文件，无需重新构建前端）。
 *
 * apiBase：后端 API 根地址（含 /api）。
 *   - 本地开发：留空，前端走 Vite 代理的 /api
 *   - 云部署：填写后端服务的公网地址，例如 https://xxx.up.railway.app/api
 *
 * cacheVersion：缓存版本戳。每次部署前端后若需强制客户端更新，改动此值即可。
 *   本文件不走 Service Worker 缓存，因此总能加载到最新版本并触发清理。
 */
window.__APP_CONFIG__ = {
  apiBase: 'https://resilient-flexibility-production-150d04fe.up.railway.app/api',
  cacheVersion: '20261124-checkin-3min'
};

/**
 * 缓存自动更新：版本戳变化时，清掉旧的 Cache Storage、注销旧 Service Worker，
 * 然后重载页面，确保用户不会看到 SW 缓存的旧版页面（例如旧的跳过绑定按钮）。
 * 用 localStorage 记录已应用的版本，避免无限重载。
 */
(function () {
  try {
    var ver = window.__APP_CONFIG__ && window.__APP_CONFIG__.cacheVersion;
    if (!ver) return;
    var KEY = 'attendance_cache_version';
    if (localStorage.getItem(KEY) === ver) return;
    localStorage.setItem(KEY, ver);
    // 标记"正在清理"，让 index.html 的内联注册脚本本轮跳过注册，避免竞态
    sessionStorage.setItem('attendance_purging', '1');
    var tasks = [];
    if (window.caches && caches.keys) {
      tasks.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tasks.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).catch(function () {}));
    }
    Promise.all(tasks).then(function () {
      sessionStorage.removeItem('attendance_purging');
      location.reload();
    });
  } catch (e) { /* 隐私模式等场景忽略 */ }
})();
