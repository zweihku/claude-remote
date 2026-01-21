# Claude TG Bridge

通过 Telegram Bot 远程控制 Claude Code CLI，在移动端与本地 Claude 进行完整上下文对话。

## 当前版本功能 (v1.0)

- **持久会话**：使用 stream-json 模式保持 Claude 进程常驻，支持多轮对话上下文记忆
- **完整工具能力**：支持文件读写、代码执行等 Claude Code 全部功能
- **会话信息查看**：实时查看 session ID、token 用量、费用统计
- **密码保护**：Telegram 端需要密码验证才能使用
- **消息队列**：Claude 忙碌时自动排队处理

## 版本历史

| 版本 | Commit | 说明 |
|------|--------|------|
| v1.0 | `2b9f2ac` | 持久会话 + /session 命令（当前版本） |
| v0.2 | `4264853` | stream-json 持久进程 |
| v0.1 | `f672ae3` | 基础 spawn 版本 |

回退到指定版本：`git checkout <commit-hash>`

---

## 快速开始

### 1. 前置要求

- Node.js 18+
- Claude Code CLI 已安装并登录 (`claude --version`)
- Telegram Bot Token（从 @BotFather 获取）

### 2. 安装

```bash
cd cli-remote
npm install
npm run build
```

### 3. 配置

生成配置文件：
```bash
./bin/claude-tg-bridge.js --init
```

编辑 `~/.claude-tg-bridge.json`：
```json
{
  "telegram": {
    "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "authPassword": "your-secret-password"
  },
  "claude": {
    "workingDirectory": "/path/to/your/project",
    "additionalArgs": []
  }
}
```

### 4. 启动 Bridge

```bash
# 方式一：直接启动
node dist/index.js

# 方式二：使用 npm
npm start

# 方式三：指定工作目录
./bin/claude-tg-bridge.js -d /path/to/project

# 方式四：后台运行
nohup node dist/index.js > /tmp/bridge.log 2>&1 &
```

### 5. 在 Telegram 中使用

1. 打开你的 Bot 对话
2. 发送 `/start`
3. 输入配置的密码
4. 验证成功后，直接发送消息即可与 Claude 对话

---

## Telegram 命令

| 命令 | 说明 |
|------|------|
| `/start` | 显示欢迎信息和命令列表 |
| `/session` | 查看当前会话信息（Session ID、Token 用量、费用） |
| `/status` | 查看 Claude 运行状态和队列 |
| `/stop` | 强制停止当前任务并清空队列 |
| `/restart` | 重启 Claude（开始新会话，清空上下文） |

---

## 工作原理

```
┌─────────────┐     WebSocket      ┌─────────────────┐     stream-json     ┌───────────┐
│  Telegram   │ ←───────────────→  │  Bridge Server  │ ←─────────────────→ │ Claude CLI│
│  (手机端)   │                    │  (本地运行)      │                     │           │
└─────────────┘                    └─────────────────┘                     └───────────┘
```

**关键技术**：
- 使用 `--input-format stream-json --output-format stream-json` 实现结构化通信
- 持久进程保持上下文，支持多轮对话
- `type: "result"` 消息标记响应完成

---

## 后台运行 & 开机自启

### macOS (launchd)

创建 `~/Library/LaunchAgents/com.claude-tg-bridge.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-tg-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/你的用户名/Desktop/cli-remote/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/你的用户名/Desktop/cli-remote</string>
    <key>StandardOutPath</key>
    <string>/tmp/claude-bridge.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-bridge.error.log</string>
</dict>
</plist>
```

启用：
```bash
launchctl load ~/Library/LaunchAgents/com.claude-tg-bridge.plist
```

停用：
```bash
launchctl unload ~/Library/LaunchAgents/com.claude-tg-bridge.plist
```

---

## 查看日志

```bash
# 实时查看日志
tail -f /tmp/bridge.log

# 查看最近日志
cat /tmp/bridge.log | tail -100
```

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | 覆盖配置中的 Bot Token |
| `AUTH_PASSWORD` | 覆盖配置中的密码 |
| `CLAUDE_WORKING_DIR` | 覆盖配置中的工作目录 |

---

## 注意事项

1. **Claude CLI 路径**：默认使用 `~/.local/bin/claude`，确保 Claude Code 已安装
2. **工作目录**：Claude 会在配置的工作目录下执行，可以读写该目录的文件
3. **权限**：使用 `--dangerously-skip-permissions` 跳过权限确认，请确保信任你的操作
4. **会话重启**：`/restart` 会丢失当前会话的上下文记忆
5. **进程崩溃**：Bridge 会自动在 3 秒后重启 Claude 进程

---

## 下一步计划

- [ ] 多会话支持（多个工作目录/项目）
- [ ] 会话切换（类似聊天软件）
- [ ] 中继服务器（远程访问）
- [ ] 原生移动端 App
