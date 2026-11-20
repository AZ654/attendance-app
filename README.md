# 员工考勤系统（基于单独授权的位置考勤）

一个合规优先的全栈位置考勤应用：员工**微信登录（手机）或账号登录（电脑）** → **首次单独授权** → 工作时段内**自动无感上报位置**（日常无需操作）→ 异步邮件通知 HR。实名信息与手机号均为**自愿填写、加密存储、脱敏展示、可随时撤回**。

## ⚖️ 合规设计（重要）

本系统针对「员工知情同意的员工考勤」场景设计，遵循以下原则：

1. **单独授权**：位置采集前展示明确告知（采集什么、什么时段、发给谁、如何撤回），员工勾选确认后才开始采集。授权可随时撤回，撤回后立即停止。
2. **最小必要**：自动上报仅在工作时段、工作日生效；服务端再次校验，非工作时段自动上报不会落库。
3. **自愿填报**：手机号、姓名、身份证号均自愿填写，需勾选知情同意；身份证号 AES-256-GCM 加密存储，接口只返回脱敏值。
4. **数据可控**：员工可随时删除自己填写的信息、撤回授权、查看授权历史与上报记录。
5. **真实边界**：微信网页登录**无法**读取用户绑定的手机号与实名信息——这是微信平台的限制。本系统不绕过该限制，改为员工自愿填写。

> Web/PWA 无法在完全零授权下静默获取精确 GPS（浏览器强制要求授权弹窗）。本系统采用「授权一次 → 之后自动」的方案满足合规与体验的平衡。若需真正全天候后台定位，需原生 App + 系统级后台定位权限，并另行做合规评估。

## 技术栈

- **后端**：Node.js 22 + Express + TypeScript + SQLite（**Node 内置 `node:sqlite`，零编译依赖**），三层架构（controller / service / repository）
- **前端**：React 18 + Vite + PWA（vite-plugin-pwa）
- **认证**：微信网页 OAuth；JWT 短时效访问令牌（内存）+ httpOnly Cookie 刷新令牌（轮换）；开发模式可模拟登录
- **校验**：zod 边界校验　**日志**：pino 结构化 JSON + requestId　**错误**：类型化 AppError + 全局处理
- **任务**：DB 持久化邮件队列（幂等 + 指数退避重试 + 死信）

## 目录结构

```
attendance-app/
├── server/
│   ├── src/
│   │   ├── config/env.ts            # 集中配置与启动校验（快速失败）
│   │   ├── lib/                      # 错误/日志/令牌/加密/校验/Cookie 工具
│   │   ├── middlewares/              # 认证/RBAC/错误/requestId
│   │   ├── modules/
│   │   │   ├── auth/                 # 微信登录、令牌、账号信息
│   │   │   ├── users/                # 自愿填写手机号/实名（脱敏）
│   │   │   ├── consent/              # 单独授权、撤回、工作时段
│   │   │   ├── locations/            # 主动/自动上报、地理围栏
│   │   │   └── admin/                # 管理端员工与记录
│   │   ├── jobs/mailer.ts            # 邮件异步队列
│   │   ├── db/                       # schema 迁移、连接
│   │   ├── app.ts / server.ts        # 组装、健康端点、优雅停机
│   └── .env.example
└── web/
    └── src/
        ├── api/client.ts             # 类型化 fetch + 401 刷新 + 重试
        ├── auth/AuthContext.tsx
        ├── lib/geo.ts                # GPS + 网络 IP 多源定位
        └── pages/                    # 登录/授权/打卡/我的/管理
```

## 本地启动

> 要求 Node.js ≥ 22.5（使用内置 `node:sqlite`，无需 Visual Studio / 本地编译）。

### 1. 后端

```bash
cd server
npm install
cp .env.example .env
# 生成密钥并填入 .env：
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # PII_ENCRYPTION_KEY
npm run migrate
npm run dev          # http://localhost:4000
```

> 本地联调保持 `AUTH_DEV_MODE=true`，用「开发模式登录」即可，无需真实微信凭证。

### 2. 前端

```bash
cd web
npm install
npm run dev          # http://localhost:5173，/api 已代理到 4000
```

首个微信登录的用户会自动成为管理员（用于演示管理端）；生产环境建议用下面的命令行显式创建管理员账号。

## 电脑端账号登录

微信网页授权依赖微信客户端，电脑浏览器无法直接使用。系统同时提供**账号 + 密码**登录，手机微信登录与电脑账号登录并存，登录后功能完全一致。

### 1. 创建账号（命令行，适合初始化管理员）

```bash
cd server
npm run migrate
npm run account:create -- --username admin --password 'StrongPass123' --role admin --nickname 管理员
# 创建员工账号
npm run account:create -- --username zhangsan --password 'StrongPass123' --nickname 张三
```

- 账号：3–32 位字母、数字、下划线或连字符，大小写无关；密码至少 8 位。
- 密码使用 **scrypt 加盐慢哈希**存储，服务端不保存明文；重复执行同一账号命令会**重置密码**，不会创建重复账号。
- 生产环境若只用账号登录、不接微信，可不配置微信凭证（需设置 `PASSWORD_LOGIN_ENABLED=true`）。

### 2. 管理端创建 / 重置（日常使用）

用管理员账号登录 → 进入「管理」页 → 在「创建电脑端账号」填写账号、初始密码、显示名称与角色。
- 已经是微信用户的员工，在员工列表点「绑定电脑账号」，即可让手机与电脑使用**同一个员工身份**，避免记录分散。
- 员工列表中可为已有账号**重置密码**。

### 3. 电脑端登录注意事项

- 电脑浏览器的精确定位同样需要授权；若电脑无 GPS，会自动回退到网络定位，也可在打卡页手动上报位置。
- 账号登录后仍需完成一次位置采集单独授权，之后才会在工作时段自动上报。
- 如要关闭账号登录，在 `server/.env` 设置 `PASSWORD_LOGIN_ENABLED=false` 并重启后端。

## 接入真实微信登录

微信网页 OAuth 使用**开放平台网站应用**的扫码登录（`snsapi_userinfo`），可获取 openid / unionid / 昵称 / 头像。**网页端无法获取绑定手机号与实名信息**（平台限制），这两项仍为应用内自愿填写。

### 1. 微信开放平台配置

1. 打开 [微信开放平台](https://open.weixin.qq.com) → 开发者中心 → **创建网站应用**，提交并通过认证（需企业资质，约 300 元/年）。
2. 审核通过后，在应用详情获取 **AppID** 和 **AppSecret**。
3. 在「授权回调域名」中登记你的**公网域名**（如 `your-domain.com`）：
   - 只填域名，不带 `https://`、不带路径、不带端口；
   - 必须是**已备案、公网可访问**的域名，**不能是 localhost 或内网 IP**；
   - 本地开发无法完成真实授权回调，需部署到该域名下测试（或用内网穿透映射到该域名）。

### 2. 后端配置（`server/.env`）

```env
NODE_ENV=production
WECHAT_APP_ID=你的AppID
WECHAT_APP_SECRET=你的AppSecret
# 关键：回调地址必须指向【前端】的 /login 页面——前端负责读取 URL 中的 code 并调用 /api/auth/login-by-code
WECHAT_REDIRECT_URI=https://your-domain.com/login
AUTH_DEV_MODE=false
CORS_ORIGIN=https://your-domain.com
```

> ⚠️ `WECHAT_REDIRECT_URI` 若误填成后端地址（`/api/auth/wechat/callback`），浏览器会停在一页 JSON 上，前端拿不到令牌。务必指向前端 `/login`。

### 3. 完整登录流程

1. 前端点「微信登录」→ `GET /api/auth/wechat/url` 生成授权链接，同时把随机 `state` 写入 httpOnly Cookie。
2. 浏览器跳转微信授权页 → 用户扫码确认 → 微信跳回 `WECHAT_REDIRECT_URI?code=xxx&state=yyy`。
3. 前端 `LoginPage` 读取 `code` + `state`，调 `POST /api/auth/login-by-code`。
4. 后端校验 `state` 与 Cookie 一致（防 CSRF）→ 用 code 换取 access_token → 拉取昵称头像 → 查找/创建用户 → 签发令牌（accessToken 走响应体、refreshToken 走 httpOnly Cookie）。
5. 前端将 accessToken 存入内存，跳转首页；刷新令牌由 httpOnly Cookie 静默续期。

### 4. 安全说明

- **state 防 CSRF**：授权请求带随机 state，回调严格比对，防止攻击者伪造登录回调。
- **令牌存储**：访问令牌仅存内存（不落 localStorage），刷新令牌为 httpOnly Cookie 且每次轮换；生产环境自动加 `secure` + `sameSite=strict`。
- **信息边界**：仅获取微信公开账号信息，不触碰手机号/实名；敏感字段一律自愿填写、加密存储、脱敏展示。

## 打卡显示具体地址（逆地理编码）

打卡成功后会直接显示**具体地址**（打卡横幅、定位卡片、打卡记录、管理端记录均展示）。地址由后端通过**高德地图 WebService 逆地理编码**解析，使用合规白名单服务商与 GCJ-02 坐标系。

### 启用步骤

1. 打开 [高德开放平台控制台](https://console.amap.com/dev/key/app) → 创建应用 → 添加 Key，服务平台选择 **Web服务**。
2. 将该 Key 填入 `server/.env` 的 `AMAP_KEY`。
3. **如果创建 Key 时开通了「数字签名」**：在 Key 的「设置」里查看私钥，填入 `AMAP_SECRET`。后端会自动按官方算法计算 `sig` 附带到请求中。默认不开通签名，留空即可。
4. 重启后端服务。

```env
AMAP_KEY=你的Web服务API密钥
AMAP_SECRET=你的数字签名私钥  # Key 开通数字签名时填；默认留空
GEO_INPUT_COORD=wgs84      # 浏览器 GPS 原始坐标；若定位源已是火星坐标改为 gcj02
GEO_REVERSE_ENABLED=true
```

> - 未配置 Key 时自动跳过地址解析，打卡功能不受影响（此时地址回退为前端网络定位的城市信息，或留空）。
> - **Key 只在后端使用，绝不写入前端代码**，避免被前端抓包泄露。
> - 地址结果带 6 小时缓存，减少配额消耗；解析失败不影响打卡主流程。
> - 浏览器 GPS 返回 WGS-84，后端会自动转换为高德要求的 GCJ-02 坐标。
> - 高德坐标顺序为「经度,纬度」（与腾讯相反），后端已按高德规则处理。
> - 历史记录补地址：配置 Key 后运行 `cd server && npx tsx tests/backfill-address.ts`（幂等，可重复运行）。

## 配置 SMTP 邮件

填入 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` / `ATTENDANCE_MAIL_TO`。
未配置时邮件任务仅入队不实际发送（开发占位），不会阻塞考勤流程。

## 主要 API

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/auth/wechat/url` | 获取微信授权 URL / 登录方式探测 | 公开 |
| POST | `/api/auth/password-login` | 电脑端账号密码登录 | 公开 |
| POST | `/api/auth/dev-login` | 开发模式登录 | 公开(仅开发) |
| POST | `/api/auth/login-by-code` | 微信 code 登录 | 公开 |
| POST | `/api/auth/refresh` | 刷新令牌（Cookie） | 公开 |
| POST | `/api/auth/logout` | 登出 | 公开 |
| GET | `/api/auth/me` | 当前账号信息 | 登录 |
| GET | `/api/users/me/profile` | 脱敏的个人资料 | 登录 |
| POST | `/api/users/me/phone` | 自愿填写手机号 | 登录 |
| POST | `/api/users/me/realname` | 自愿填写实名信息 | 登录 |
| DELETE | `/api/users/me/phone` / `/realname` | 删除敏感信息 | 登录 |
| GET | `/api/consent/notice` | 授权告知文案 | 登录 |
| GET/POST | `/api/consent/mine` / `/grant` / `/revoke` | 授权管理 | 登录 |
| POST | `/api/locations/report` | 上报位置（active/auto） | 登录+授权 |
| GET | `/api/locations/mine` | 我的上报记录 | 登录 |
| GET | `/api/admin/employees` | 员工概览 | 管理员 |
| GET | `/api/admin/locations` | 全员位置记录 | 管理员 |
| POST | `/api/admin/accounts` | 创建电脑端账号 | 管理员 |
| POST | `/api/admin/accounts/:id/bind` | 为已有员工绑定电脑账号 | 管理员 |
| POST | `/api/admin/accounts/:id/password` | 重置账号密码 | 管理员 |
| GET | `/health` / `/ready` | 健康/就绪检查 | 公开 |

## 验证

```bash
# 后端
cd server
npm run typecheck     # 类型检查
npm test              # 单元测试（距离计算/脱敏/加密）
npm run build         # 编译
npm run dev           # 启动
node tests/smoke.mjs  # 端到端冒烟（22 项：登录/授权/上报/脱敏/管理端/刷新/撤回）

# 前端
cd web
npm run typecheck && npm run build
npm run dev           # http://localhost:5173
```

## 生产上线清单

- [ ] 关闭 `AUTH_DEV_MODE`；按需配置真实微信凭证或仅启用 `PASSWORD_LOGIN_ENABLED`
- [ ] 用命令行创建管理员账号并妥善保管初始密码，首次登录后提醒修改
- [ ] 生成并安全保管三类密钥，`.env` 加入 `.gitignore`（已配置）
- [ ] `CORS_ORIGIN` 显式配置前端域名，禁止通配符
- [ ] 全站 HTTPS（Cookie `secure` 在生产自动开启）
- [ ] 配置 SMTP 与通知邮箱
- [ ] 按需配置 `OFFICE_LAT/OFFICE_LNG`、`ATTENDANCE_RADIUS_METERS` 工作时段与工作日
- [ ] 明确管理员角色分配策略（当前首个用户自动成为管理员仅用于演示）
- [ ] 按公司制度确定数据保留期限与定期清理策略
