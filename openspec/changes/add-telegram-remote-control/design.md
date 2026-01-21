## Context

用户希望远程控制 Claude Code CLI，无需守在电脑前。通过 Telegram Bot 作为远程接口，实现双向通信。

**约束条件：**
- 必须与现有 Claude CLI 兼容，不修改 Claude CLI 本身
- 需要处理网络不稳定的情况
- 安全性：防止未授权访问

## Goals / Non-Goals

**Goals:**
- 实现 Claude CLI 输出到 Telegram 的单向推送
- 实现 Telegram 回复到 Claude CLI 的指令注入
- 密码验证机制
- 消息格式化（工具调用摘要）

**Non-Goals:**
- 不修改 Claude Code CLI 源码
- 不实现多用户并发控制
- 不实现消息历史持久化（超出 Telegram 自身能力）
- 不实现文件传输（仅文本消息）

## Architecture

```
┌─────────────┐     stdin      ┌──────────────────┐     HTTP      ┌─────────────┐
│   Claude    │◄──────────────│  claude-tg-bridge │◄────────────►│  Telegram   │
│    CLI      │──────────────►│    (守护进程)      │              │   Bot API   │
└─────────────┘  stream-json   └──────────────────┘              └─────────────┘
                                       │                                │
                                       │                                │
                                       ▼                                ▼
                               ┌──────────────┐                  ┌─────────────┐
                               │  Config File │                  │  用户手机    │
                               │  .json       │                  │  Telegram   │
                               └──────────────┘                  └─────────────┘
```

## Decisions

### 1. 使用 Claude CLI 的 stream-json 模式

**决定**: 使用 `claude --print --output-format stream-json --input-format stream-json` 启动 Claude CLI

**原因**:
- 提供结构化的实时输出，便于解析
- 支持双向流式通信
- 无需修改 Claude CLI

### 2. Node.js 实现

**决定**: 使用 Node.js/TypeScript 实现守护进程

**原因**:
- Claude CLI 本身是 Node.js 项目，保持一致
- node-telegram-bot-api 库成熟稳定
- 异步 I/O 处理能力强

### 3. 单文件配置

**决定**: 使用 `~/.claude-tg-bridge.json` 存储配置

**配置结构**:
```json
{
  "telegram": {
    "botToken": "xxx:yyy",
    "authPassword": "your-secret-password"
  },
  "claude": {
    "workingDirectory": "/path/to/project",
    "additionalArgs": []
  }
}
```

### 4. 消息格式化策略

**决定**: 推送结构化消息，包含：
- Claude 文本回复（截断长消息）
- 工具调用摘要（类型 + 关键参数）
- 状态指示器（思考中/等待输入/完成）

**格式示例**:
```
🤖 Claude 正在工作...

📝 执行工具: Edit
   文件: src/main.ts
   操作: 修改第 42-50 行

💬 回复:
我已经修改了 main.ts 文件，添加了错误处理逻辑...

⏸ 等待您的指令
```

### 5. 密码验证流程

**决定**: 首次发送消息时要求输入密码，验证后记住 chat_id

**流程**:
1. 用户发送任意消息
2. Bot 回复要求输入密码
3. 用户发送密码
4. 验证成功后记录 chat_id 到内存
5. 后续消息直接处理

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 网络断开导致消息丢失 | 中 | 本地缓存未发送消息，重连后重发 |
| 长消息被 Telegram 截断 | 低 | 分片发送，添加分页标记 |
| 密码泄露 | 高 | 支持环境变量配置，不在配置文件明文存储 |
| Claude CLI 崩溃 | 中 | 自动重启机制，通知用户 |

## Resolved Questions

1. ~~是否需要支持多个 Telegram 用户同时控制？~~ → **否**，单用户模式
2. ~~是否需要支持 /stop 命令强制终止当前任务？~~ → **是**，已包含在 spec 中
3. ~~是否需要文件预览功能？~~ → **否**，不实现
