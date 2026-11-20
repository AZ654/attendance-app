/** 冒烟测试：串联登录 → 账号 → 授权 → 位置上报 → 敏感信息 → 管理端。 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:4000/api';
let accessToken = '';
let cookie = '';
let pass = 0;
let fail = 0;

function extractCookie(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function call(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = extractCookie(res);
  if (setCookie) cookie = setCookie;
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function main() {
  console.log('=== 冒烟测试开始 ===');

  // 1. 健康检查
  let r = await fetch('http://localhost:4000/health').then((x) => x.json());
  check('健康检查 /health', r.status === 'ok');

  // 2. 开发登录
  r = await call('POST', '/auth/dev-login', { openid: 'emp-smoke-001', nickname: '冒烟测试员工' }, false);
  check('开发登录返回 accessToken', r.status === 200 && !!r.data?.accessToken, JSON.stringify(r.data));
  accessToken = r.data?.accessToken || '';
  const isAdmin = r.data?.user?.role === 'admin';
  check('返回用户信息含角色', !!r.data?.user?.role);

  // 3. 账号信息
  r = await call('GET', '/auth/me');
  check('获取账号信息', r.status === 200 && r.data?.openid === 'emp-smoke-001');

  // 4. 用途告知
  r = await call('GET', '/users/purpose');
  check('获取信息用途告知', r.status === 200 && !!r.data?.note);

  // 5. 授权告知 + 授权
  r = await call('GET', '/consent/notice');
  check('获取授权告知文案', r.status === 200 && r.data?.required === true);
  r = await call('POST', '/consent/grant', { acknowledged: true });
  check('提交位置采集授权', r.status === 200 && r.data?.active === true, JSON.stringify(r.data));
  const consentId = r.data?.id;

  // 6. 授权状态
  r = await call('GET', '/consent/mine');
  check('查询当前授权状态', r.status === 200 && r.data?.consent?.active === true);

  // 7. 位置上报（主动）
  r = await call('POST', '/locations/report', {
    latitude: 22.5432, longitude: 114.0580, accuracyM: 10, source: 'gps', mode: 'active',
  });
  check('主动上报位置', r.status === 201 && typeof r.data?.withinGeofence === 'boolean', JSON.stringify(r.data));
  check('考勤点在范围内', r.data?.withinGeofence === true, `distance=${r.data?.distanceM}`);

  // 8. 范围外上报
  r = await call('POST', '/locations/report', {
    latitude: 39.9042, longitude: 116.4074, accuracyM: 20, source: 'gps', mode: 'active',
  });
  check('范围外上报被标记为范围外', r.status === 201 && r.data?.withinGeofence === false);

  // 9. 我的上报记录
  r = await call('GET', '/locations/mine?limit=10');
  check('查询我的上报记录', r.status === 200 && Array.isArray(r.data?.items) && r.data.items.length >= 2);

  // 10. 填写手机号（自愿）
  r = await call('POST', '/users/me/phone', { phone: '13800138000', consent: true });
  check('保存手机号（知情同意）', r.status === 200 && r.data?.hasPhone === true);
  check('手机号脱敏返回', r.data?.phoneMasked === '138****8000', JSON.stringify(r.data));

  // 11. 填写实名（自愿）
  r = await call('POST', '/users/me/realname', { realName: '张三', idCard: '440301199001011234', consent: true });
  check('保存实名信息（知情同意）', r.status === 200 && r.data?.hasRealname === true);
  check('身份证号脱敏返回', r.data?.idCardMasked?.includes('*'), JSON.stringify(r.data));

  // 12. 缺同意应被拒绝
  r = await call('POST', '/users/me/phone', { phone: '13900139000', consent: false });
  check('未勾选知情同意被拒绝', r.status === 400);

  // 13. 管理端（首个用户为管理员）
  if (isAdmin) {
    r = await call('GET', '/admin/employees');
    check('管理端员工列表', r.status === 200 && Array.isArray(r.data?.items) && r.data.items.length >= 1);
    r = await call('GET', '/admin/locations?limit=10');
    check('管理端位置记录', r.status === 200 && Array.isArray(r.data?.items) && r.data.items.length >= 2);
  } else {
    r = await call('GET', '/admin/employees');
    check('非管理员访问管理端被拒绝', r.status === 403);
  }

  // 14. 令牌刷新（用 Cookie）
  r = await call('POST', '/auth/refresh', undefined, false);
  check('刷新令牌（httpOnly Cookie）', r.status === 200 && !!r.data?.accessToken, JSON.stringify(r.data));

  // 15. 撤回授权
  r = await call('POST', '/consent/revoke');
  check('撤回位置授权', r.status === 200 && r.data?.revoked === true);

  // 16. 撤回后上报应被拒绝
  r = await call('POST', '/locations/report', {
    latitude: 22.5432, longitude: 114.0580, source: 'gps', mode: 'active',
  });
  check('撤回授权后上报被拒绝', r.status === 403, JSON.stringify(r.data));

  console.log(`\n=== 结果：通过 ${pass}，失败 ${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('冒烟测试异常:', e); process.exit(1); });
