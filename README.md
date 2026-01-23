# Claude Remote

[English](#english) | [中文](#中文)

---

## English

Control [Claude Code CLI](https://github.com/anthropics/claude-code) from your mobile device.

Claude Remote lets you send prompts to Claude Code running on your desktop from your phone's browser. Perfect for coding on the go, reviewing code from your couch, or pair programming with AI from anywhere.

### How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Mobile    │ ──────▶ │ Relay Server │ ──────▶ │   Desktop   │
│  (Browser)  │ ◀────── │   (Cloud)    │ ◀────── │ (Claude CLI)│
└─────────────┘         └──────────────┘         └─────────────┘
```

1. **Desktop App** connects to the relay server and gets a 4-digit pairing code
2. **Mobile Browser** opens the relay server URL and enters the pairing code
3. Messages are relayed between mobile and desktop in real-time
4. Claude Code CLI executes commands locally on your desktop

### Quick Start

#### Step 1: Deploy Relay Server (Railway)

1. Create a [Railway](https://railway.app) account
2. Click **New Project** → **Deploy from GitHub repo**
3. Connect this repository
4. Railway auto-detects the Dockerfile and deploys
5. Go to **Settings** → **Networking** → **Generate Domain**
6. Note your URL: `https://<project>.up.railway.app`

#### Step 2: Download Desktop App

Download from [Releases](../../releases):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `Claude.Remote-mac-arm64.zip` |
| Windows (64-bit) | `Claude.Remote-win-x64-Setup.exe` |
| Windows (Portable) | `Claude.Remote-win-x64-Portable.exe` |

**macOS**: Right-click → Open (to bypass Gatekeeper)
**Windows**: Run the installer or portable exe directly

#### Step 3: Connect

**On Desktop:**
1. Open `Claude Remote.app`
2. Enter your relay server URL (e.g., `https://xxx.up.railway.app`)
3. Add directories Claude can access
4. Click **Connect**
5. A 4-digit pairing code appears

**On Mobile:**
1. Open the same relay server URL in your browser
2. Enter the 4-digit pairing code
3. Start chatting with Claude!

### Alternative Deployment

#### Docker

```bash
docker build -t claude-remote .
docker run -p 3000:3000 claude-remote
```

#### Manual

```bash
# Build shared package
cd packages/shared
npm install && npm run build

# Build and run relay server
cd ../relay
npm install && npm run build
npm start
```

#### Other Cloud Platforms

The Dockerfile works with any platform supporting containers:
- [Render](https://render.com)
- [Fly.io](https://fly.io)
- [Google Cloud Run](https://cloud.google.com/run)
- [AWS App Runner](https://aws.amazon.com/apprunner/)

### Features

- **Multi-session support** - Work on multiple projects simultaneously
- **Directory access control** - Restrict Claude's file access
- **Custom server URL** - Use your own relay server
- **Real-time sync** - Instant message relay via WebSocket
- **Mobile-optimized UI** - Designed for touch and virtual keyboard

### Security

- All communication over HTTPS/WSS (encrypted)
- Pairing codes expire after 5 minutes
- Claude CLI runs locally - your code never leaves your machine
- Relay server is stateless - no message storage
- You control your own relay server

### Requirements

- **Desktop**: macOS (Apple Silicon / Intel) or Windows (64-bit)
- **Mobile**: Any modern browser (Safari, Chrome, Firefox)
- **Server**: Node.js 18+ or Docker

---

## 中文

通过手机远程控制桌面端 [Claude Code CLI](https://github.com/anthropics/claude-code)。

Claude Remote 让你可以在手机浏览器上向桌面端的 Claude Code 发送指令。无论是在沙发上审查代码，还是外出时处理编程任务，都能随时随地与 AI 结对编程。

### 工作原理

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│    手机     │ ──────▶ │   中继服务器  │ ──────▶ │    桌面端    │
│  (浏览器)   │ ◀────── │    (云端)    │ ◀────── │ (Claude CLI)│
└─────────────┘         └──────────────┘         └─────────────┘
```

1. **桌面应用** 连接中继服务器，获取 4 位配对码
2. **手机浏览器** 打开中继服务器地址，输入配对码
3. 消息通过中继服务器实时转发
4. Claude Code CLI 在桌面端本地执行命令

### 快速开始

#### 第一步：部署中继服务器 (Railway)

1. 注册 [Railway](https://railway.app) 账户
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 连接此仓库
4. Railway 自动识别 Dockerfile 并部署
5. 进入 **Settings** → **Networking** → **Generate Domain**
6. 记下你的服务器地址：`https://<项目名>.up.railway.app`

#### 第二步：下载桌面应用

从 [Releases](../../releases) 下载：

| 平台 | 下载 |
|------|------|
| macOS (Apple Silicon) | `Claude.Remote-mac-arm64.zip` |
| Windows (64位) | `Claude.Remote-win-x64-Setup.exe` |
| Windows (便携版) | `Claude.Remote-win-x64-Portable.exe` |

**macOS**：右键点击 → 打开（绕过 Gatekeeper 验证）
**Windows**：运行安装程序或直接运行便携版

#### 第三步：配对连接

**桌面端：**
1. 打开 `Claude Remote.app`
2. 输入你的中继服务器地址（如 `https://xxx.up.railway.app`）
3. 添加允许 Claude 访问的目录
4. 点击 **Connect**
5. 显示 4 位配对码

**手机端：**
1. 在浏览器打开同样的中继服务器地址
2. 输入 4 位配对码
3. 开始与 Claude 对话！

### 其他部署方式

#### Docker

```bash
docker build -t claude-remote .
docker run -p 3000:3000 claude-remote
```

#### 手动部署

```bash
# 构建共享包
cd packages/shared
npm install && npm run build

# 构建并运行中继服务器
cd ../relay
npm install && npm run build
npm start
```

#### 其他云平台

Dockerfile 支持任何容器平台：
- [Render](https://render.com)
- [Fly.io](https://fly.io)
- [Google Cloud Run](https://cloud.google.com/run)
- [AWS App Runner](https://aws.amazon.com/apprunner/)

### 功能特性

- **多会话支持** - 同时处理多个项目
- **目录访问控制** - 限制 Claude 的文件访问范围
- **自定义服务器** - 使用自己部署的中继服务器
- **实时同步** - WebSocket 即时消息转发
- **移动端优化** - 专为触屏和虚拟键盘设计

### 安全说明

- 所有通信通过 HTTPS/WSS 加密传输
- 配对码 5 分钟后过期
- Claude CLI 在本地运行，代码不会上传
- 中继服务器无状态，不存储任何消息
- 你完全控制自己的服务器

### 系统要求

- **桌面端**：macOS (Apple Silicon / Intel) 或 Windows (64位)
- **手机端**：任意现代浏览器 (Safari, Chrome, Firefox)
- **服务器**：Node.js 18+ 或 Docker

---

## Project Structure / 项目结构

```
claude-remote/
├── packages/
│   ├── relay/          # Relay server / 中继服务器
│   │   ├── src/        # Server code / 服务器代码
│   │   └── public/     # Mobile web UI / 手机端界面
│   └── shared/         # Shared constants / 共享常量
├── Dockerfile          # Cloud deployment / 云部署
└── README.md
```

## License / 许可证

MIT

## Credits / 致谢

Built for use with [Claude Code](https://github.com/anthropics/claude-code) by Anthropic.
