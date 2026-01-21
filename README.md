# Claude TG Bridge

通过 Telegram Bot 远程控制 Claude Code CLI，让你可以在移动端监控和指挥 Claude 工作。

## 功能

- 将 Claude 的回复和工具调用实时推送到 Telegram
- 通过 Telegram 发送指令控制 Claude
- 密码验证保护
- 支持 `/stop` 强制终止任务
- 自动分片处理长消息

## 安装

```bash
npm install
npm run build
```

## 配置

1. 生成配置文件：

```bash
./bin/claude-tg-bridge.js --init
```

2. 编辑 `~/.claude-tg-bridge.json`：

```json
{
  "telegram": {
    "botToken": "你的Bot Token",
    "authPassword": "你的访问密码"
  },
  "claude": {
    "workingDirectory": "/path/to/your/project",
    "additionalArgs": []
  }
}
```

## 使用

启动 bridge：

```bash
# 使用默认配置
./bin/claude-tg-bridge.js

# 指定工作目录
./bin/claude-tg-bridge.js -d /path/to/project

# 开发模式
npm run dev
```

### Telegram 命令

| 命令 | 说明 |
|------|------|
| `/start` | 显示欢迎信息 |
| `/status` | 查看 Claude 运行状态 |
| `/stop` | 强制停止当前任务 |
| `/restart` | 重启 Claude |

### 使用流程

1. 在 Telegram 中找到你的 Bot
2. 发送任意消息，Bot 会要求输入密码
3. 输入配置的密码，验证成功后即可使用
4. 发送文本消息作为 Claude 的输入指令
5. Claude 的回复和工具调用会推送到 Telegram

## 环境变量

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | 覆盖配置中的 Bot Token |
| `AUTH_PASSWORD` | 覆盖配置中的密码 |
| `CLAUDE_WORKING_DIR` | 覆盖配置中的工作目录 |

## 架构

```
Claude CLI  <──stdin──>  claude-tg-bridge  <──HTTP──>  Telegram Bot  <──>  手机
           stream-json
```

## 注意事项

- 确保 `claude` 命令在 PATH 中可用
- Bot Token 请妥善保管，不要提交到代码仓库
- 密码验证仅在内存中维护，重启后需要重新验证
