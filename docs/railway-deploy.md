# Railway 部署指南

## 1. 注册 Railway 账户

1. 访问 [railway.app](https://railway.app)
2. 点击 **"Login"** → 选择 **"GitHub"** 登录
3. 授权 Railway 访问你的 GitHub

## 2. 推送代码到 GitHub

如果你的项目还没有在 GitHub 上，先创建仓库：

```bash
# 在项目根目录
cd /Users/aptxzwei/Desktop/cli-remote

# 初始化 Git（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit for Railway deployment"

# 创建 GitHub 仓库后，添加远程地址
git remote add origin https://github.com/你的用户名/claude-remote.git

# 推送
git push -u origin main
```

## 3. 在 Railway 部署

### 方式一：从 GitHub 部署（推荐）

1. 登录 [railway.app](https://railway.app)
2. 点击 **"New Project"**
3. 选择 **"Deploy from GitHub repo"**
4. 选择你的 `claude-remote` 仓库
5. Railway 会自动检测 `railway.json` 配置并开始部署

### 方式二：使用 Railway CLI

```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 初始化项目（在项目根目录）
railway init

# 部署
railway up
```

## 4. 配置域名

部署成功后：

1. 进入 Railway 项目面板
2. 点击你的服务
3. 点击 **"Settings"** → **"Networking"**
4. 点击 **"Generate Domain"** 获取免费域名
   - 格式类似：`xxx.up.railway.app`

## 5. 更新客户端配置

获得 Railway 域名后，更新桌面端和移动端连接地址：

**桌面端** 启动时使用你的 Railway URL：
```
wss://你的项目.up.railway.app
```

**移动端** 访问：
```
https://你的项目.up.railway.app
```

## 6. 环境变量（可选）

在 Railway 面板的 **"Variables"** 中可以设置：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | 服务端口 | 3000（Railway 自动设置）|

## 费用说明

- Railway 提供 **$5/月免费额度**
- WebSocket 中继服务器资源消耗很低
- 通常免费额度足够个人使用

## 常见问题

### 部署失败？
- 检查 GitHub 仓库是否是 public 或已授权
- 查看 Railway 的 Deploy Logs 获取错误信息

### WebSocket 连接失败？
- 确保使用 `wss://` 而不是 `ws://`（Railway 强制 HTTPS）
- 检查域名是否正确

### 如何查看日志？
- Railway 面板 → 选择服务 → **"Logs"** 标签

## 部署完成后的架构

```
手机浏览器 ──HTTPS/WSS──> Railway (claude-remote.up.railway.app)
                                    ↑
                                    │ WSS
                                    │
桌面端 ─────────────────────────────┘
```

两端都通过互联网连接到 Railway 服务器，不再需要局域网直连。
