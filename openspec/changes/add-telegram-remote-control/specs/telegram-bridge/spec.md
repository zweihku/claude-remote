## ADDED Requirements

### Requirement: Bridge Daemon

系统 SHALL 提供一个独立的守护进程 `claude-tg-bridge`，作为 Claude CLI 和 Telegram Bot 之间的双向通信桥梁。

#### Scenario: 启动守护进程

- **GIVEN** 用户已配置有效的 Telegram Bot Token 和密码
- **WHEN** 用户执行 `claude-tg-bridge` 命令
- **THEN** 守护进程启动并连接到 Telegram Bot API
- **AND** 在控制台显示 "Bridge started, waiting for Telegram messages..."

#### Scenario: 配置缺失时报错

- **GIVEN** 配置文件不存在或缺少必要字段
- **WHEN** 用户执行 `claude-tg-bridge` 命令
- **THEN** 显示具体的配置错误信息
- **AND** 提示运行 `claude-tg-bridge --init` 生成配置模板

---

### Requirement: Password Authentication

系统 SHALL 要求用户在首次通过 Telegram 发送消息时进行密码验证。

#### Scenario: 首次连接需要密码

- **GIVEN** 守护进程正在运行
- **AND** 用户的 chat_id 尚未通过验证
- **WHEN** 用户通过 Telegram 发送任意消息
- **THEN** Bot 回复 "🔐 请输入访问密码："

#### Scenario: 密码验证成功

- **GIVEN** Bot 已要求输入密码
- **WHEN** 用户发送正确的密码
- **THEN** Bot 回复 "✅ 验证成功！现在可以开始使用了。"
- **AND** 记住该 chat_id，后续消息无需再次验证

#### Scenario: 密码验证失败

- **GIVEN** Bot 已要求输入密码
- **WHEN** 用户发送错误的密码
- **THEN** Bot 回复 "❌ 密码错误，请重试。"
- **AND** 允许用户继续尝试

---

### Requirement: Output Forwarding

系统 SHALL 将 Claude CLI 的输出实时转发到 Telegram。

#### Scenario: 转发文本回复

- **GIVEN** Claude CLI 正在运行
- **WHEN** Claude 生成文本回复
- **THEN** 守护进程将回复内容发送到 Telegram
- **AND** 消息以 "💬" emoji 开头标识

#### Scenario: 转发工具调用摘要

- **GIVEN** Claude CLI 正在运行
- **WHEN** Claude 调用工具（如 Edit, Bash, Read）
- **THEN** 守护进程发送工具调用摘要到 Telegram
- **AND** 摘要包含：工具类型、关键参数（文件路径、命令等）
- **AND** 消息以对应 emoji 标识（📝 Edit, 🖥 Bash, 📖 Read）

#### Scenario: 处理长消息

- **GIVEN** Claude 回复内容超过 4096 字符（Telegram 限制）
- **WHEN** 守护进程准备发送消息
- **THEN** 自动分片发送，每片不超过 4000 字符
- **AND** 分片消息标注 "[1/3]", "[2/3]" 等序号

---

### Requirement: Input Injection

系统 SHALL 接收来自 Telegram 的用户消息并注入到 Claude CLI。

#### Scenario: 注入用户指令

- **GIVEN** 用户已通过密码验证
- **AND** Claude CLI 处于等待输入状态
- **WHEN** 用户在 Telegram 发送文本消息
- **THEN** 消息内容被注入到 Claude CLI 的 stdin
- **AND** 向用户发送 "📤 已发送指令" 确认

#### Scenario: Claude 忙碌时缓存指令

- **GIVEN** Claude CLI 正在处理任务
- **WHEN** 用户在 Telegram 发送新指令
- **THEN** 指令被加入队列
- **AND** 向用户发送 "⏳ Claude 正在工作中，您的指令已排队"

---

### Requirement: Session Commands

系统 SHALL 支持通过 Telegram 命令控制 Claude 会话。

#### Scenario: /start 命令

- **WHEN** 用户发送 `/start`
- **THEN** Bot 显示欢迎信息和可用命令列表

#### Scenario: /status 命令

- **WHEN** 用户发送 `/status`
- **THEN** Bot 显示当前状态：Claude CLI 是否运行、工作目录、会话信息

#### Scenario: /stop 命令

- **GIVEN** Claude CLI 正在运行
- **WHEN** 用户发送 `/stop`
- **THEN** 终止当前 Claude CLI 进程
- **AND** 通知用户 "⏹ Claude 已停止"

#### Scenario: /restart 命令

- **WHEN** 用户发送 `/restart`
- **THEN** 重启 Claude CLI 进程
- **AND** 通知用户 "🔄 Claude 已重启"

---

### Requirement: Error Handling

系统 SHALL 处理各种异常情况并通知用户。

#### Scenario: Claude CLI 崩溃

- **GIVEN** Claude CLI 正在运行
- **WHEN** Claude CLI 进程意外退出
- **THEN** 向 Telegram 发送 "⚠️ Claude 进程已退出 (code: X)"
- **AND** 提示用户可以使用 `/restart` 重启

#### Scenario: 网络断开后重连

- **GIVEN** 守护进程正在运行
- **WHEN** 与 Telegram API 的连接断开
- **THEN** 自动尝试重连（指数退避策略）
- **AND** 重连成功后发送 "🔗 连接已恢复"

---

### Requirement: Configuration

系统 SHALL 支持通过配置文件和环境变量进行配置。

#### Scenario: 从配置文件加载

- **GIVEN** 存在 `~/.claude-tg-bridge.json` 配置文件
- **WHEN** 守护进程启动
- **THEN** 从配置文件加载 Bot Token、密码、工作目录等设置

#### Scenario: 环境变量覆盖

- **GIVEN** 设置了 `TELEGRAM_BOT_TOKEN` 环境变量
- **WHEN** 守护进程启动
- **THEN** 环境变量的值覆盖配置文件中的 botToken

#### Scenario: 生成配置模板

- **WHEN** 用户执行 `claude-tg-bridge --init`
- **THEN** 在当前目录生成 `.claude-tg-bridge.json` 配置模板
- **AND** 显示配置说明
