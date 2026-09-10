# 🌌 AURORA API · Cloudflare Pages 极速部署实战指南

> 本项目前端已按 **纯静态架构 (Pure Static Jamstack)** 重构，100% 兼容 **Cloudflare Pages** 零成本、全球 Edge Anycast CDN 加速与自动化部署。

---

## 目录
1. [架构亮点与部署优势](#1-架构亮点与部署优势)
2. [三种 0 门槛部署方式](#2-三种-0-门槛部署方式)
   - [方式一：GitHub 自动化持续集成（最推荐）](#方式一github-自动化持续集成最推荐)
   - [方式二：Wrangler CLI 命令行一键秒级上传](#方式二wrangler-cli-命令行一键秒级上传)
   - [方式三：Cloudflare 仪表盘免代码拖拽上传](#方式三cloudflare-仪表盘免代码拖拽上传)
3. [前后端 API 联调与反代配置](#3-前后端-api-联调与反代配置)
4. [绑定自定义独立域名与全站 HTTPS](#4-绑定自定义独立域名与全站-https)
5. [常见问题 FAQ](#5-常见问题-faq)

---

## 1. 架构亮点与部署优势

- **极高颜值**：深度汲取 [ReactBits.dev](https://reactbits.dev/)（极光流体光晕、鼠标聚光灯跟随、点阵空间网格）与 [MotionSites.ai](https://motionsites.ai/)（暗夜深空美学、晶体拟态玻璃、macOS 终端 SSE 流式打字机）设计语言。
- **纯静态零运维**：所有页面均为原生 HTML5 + 现代 CSS3 + Vanilla ES6，无任何动态模板或 Node 依赖，可直接托管在边缘 CDN。
- **免费全球加速**：Cloudflare 超过 300 个全球数据中心边缘节点，国内访问秒级首屏加载，自带抗 DDoS 护盾。
- **灵活前后端解耦**：前端既可通过 `_redirects` 经由 Cloudflare 边缘节点透明反向代理，也可在界面点击 **【⚙️ 配置网关】** 自由指向任何公网后端。

---

## 2. 三种 0 门槛部署方式

### 方式一：GitHub 自动化持续集成（最推荐）

适合希望代码一更新、线上官网自动同步的场景：

1. **推送到 GitHub**：将本项目提交并推送到您的 GitHub 个人或团队仓库中。
2. **打开 Cloudflare 控制台**：
   - 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ 左侧菜单进入 **Workers & Pages** ➔ 点击 **Create Application** ➔ 选择 **Pages** 选项卡。
3. **连接 Git 仓库**：
   - 点击 **Connect to Git**，授权并选择您的 GitHub 仓库。
4. **配置构建参数**：
   - **Project Name**：自定义（如 `aurora-api`）
   - **Production branch**：`main` 或 `master`
   - **Framework preset**：选择 `None`
   - **Build command**：**留空**（无需编译）
   - **Build output directory**：填入 `standalone-api-hub/public`（若您将该目录单独作为根目录，则填入 `public` 或 `.`）
5. **点击 Save and Deploy**：
   - 约 15 秒后部署完成，即可获得专属的 `https://aurora-api.pages.dev` 访问链接！

---

### 方式二：Wrangler CLI 命令行一键秒级上传

适合不想绑定 Git 仓库、直接在本地终端一键上传的用户：

```bash
# 1. 切换到项目前端目录
cd standalone-api-hub

# 2. 执行 Cloudflare 官方部署工具 (无需提前安装，npx 自动下载)
npx wrangler pages deploy public --project-name=aurora-api
```

> 首次运行会自动在浏览器中弹窗提示登录 Cloudflare 账号，点击授权后终端会自动上传所有静态资源并输出可直接访问的 HTTPS 域名。

---

### 方式三：Cloudflare 仪表盘免代码拖拽上传

适合不需要敲命令、直接网页图形化操作：

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ **Workers & Pages** ➔ **Create Application** ➔ **Pages**。
2. 选择 **Upload Assets**（直接上传文件）。
3. 项目名称输入 `aurora-api`。
4. 将本地电脑上的 `standalone-api-hub/public` 文件夹直接**拖入网页中央的虚线方框内**。
5. 点击 **Deploy site**，秒级部署上线！

---

## 3. 前后端 API 联调与反代配置

由于前端静态部署在 Cloudflare Pages，而后端网关 `server.js` 通常运行在云服务器（ECS / 轻量 / VPS / Docker / Railway）上，可通过以下两种方式对接：

### 方案 A：Cloudflare `_redirects` 边缘透明反代（推荐）

在 `public/_redirects` 文件中，取消注释并填入您的后端服务器公网域名：

```text
# 将请求无缝透明反代至后端服务器
/v1/*   https://api.yourdomain.com/v1/:splat   200
/api/*  https://api.yourdomain.com/api/:splat  200
/claim  /claim.html                            200
/*      /index.html                            200
```
> **优势**：浏览器发出的所有请求均直接走同域名路径 `/v1/chat/completions`，完全免除浏览器跨域 CORS 限制，且隐藏后端真实 IP。

### 方案 B：界面内置「⚙️ 配置网关」快速直连

如果后端刚启动、还没解析域名：
1. 打开部署好的 Cloudflare 网站（例如 `https://aurora-api.pages.dev`）。
2. 在首页 **【📡 统一接口地址】** 右侧点击 **【⚙️ 配置网关】**。
3. 输入后端公网 IP 或域名（如 `http://47.xxx.xxx.xxx:3005` 或 `https://my-api-server.com`）。
4. 点击保存，前端所有终端调用、额度查询、卡密激活均自动指向该网关！配置保存在浏览器本地。

---

## 4. 绑定自定义独立域名与全站 HTTPS

1. 进入 Cloudflare Pages 项目详情页。
2. 点击 **Custom domains**（自定义域）➔ **Set up a custom domain**。
3. 输入您自己的域名（例如 `ai.yourdomain.com` 或主域名 `yourdomain.com`）。
4. 若域名本身就在 Cloudflare 托管解析，系统将自动添加 CNAME 记录；若在阿里云/腾讯云，复制提示的 CNAME 记录添加解析即可。
5. Cloudflare 将自动为您申请免费的 Universal SSL 证书，支持 HTTP/2、HTTP/3 全球毫秒分发！

---

## 5. 常见问题 FAQ

- **Q1: 提卡页面 `https://xxxx.pages.dev/claim` 会出现 404 吗？**  
  不会。项目内已配置 `public/_redirects`：`/claim /claim.html 200`，直接访问 `/claim` 即可无感加载提卡中心。

- **Q2: 为什么在线联调终端能够支持流式打字机输出？**  
  前端使用标准 `fetch` 结合 `ReadableStream` 与 `TextDecoder` 解析 SSE `data: {...}` 事件流，即使在边缘 CDN 代理下也能实现实时逐字吐出效果。

- **Q3: 静态部署后，如何防刷？**  
  提卡系统采用 **一单一密强绑定引擎**，每个真实支付的订单号只能核销一张 API Key，重复提交仅展示同一张历史密钥，防白嫖刷单。
