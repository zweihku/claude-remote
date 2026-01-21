## 1. 项目初始化

- [x] 1.1 初始化 Node.js 项目 (package.json, tsconfig.json)
- [x] 1.2 安装依赖: `node-telegram-bot-api`, `typescript`, `tsx`
- [x] 1.3 创建目录结构: `src/bridge/`, `src/telegram/`, `bin/`

## 2. 配置管理

- [x] 2.1 实现配置加载器 (`src/config.ts`)
- [x] 2.2 支持从 `~/.claude-tg-bridge.json` 读取配置
- [x] 2.3 支持环境变量覆盖敏感配置 (TELEGRAM_BOT_TOKEN, AUTH_PASSWORD)
- [x] 2.4 添加配置验证和错误提示

## 3. Claude CLI 集成

- [x] 3.1 实现 Claude CLI 进程管理器 (`src/bridge/claude-process.ts`)
- [x] 3.2 使用 `--output-format stream-json` 解析输出流
- [x] 3.3 使用 `--input-format stream-json` 注入用户输入
- [x] 3.4 处理进程生命周期（启动、重启、终止）
- [x] 3.5 解析 stream-json 消息类型（assistant, tool_use, tool_result 等）

## 4. Telegram Bot 集成

- [x] 4.1 实现 Telegram Bot 客户端 (`src/telegram/bot.ts`)
- [x] 4.2 实现密码验证流程
- [x] 4.3 实现消息发送（支持长消息分片）
- [x] 4.4 实现消息接收和指令解析
- [x] 4.5 添加命令支持: `/start`, `/status`, `/stop`, `/restart`

## 5. 消息格式化

- [x] 5.1 实现输出格式化器 (`src/bridge/formatter.ts`)
- [x] 5.2 格式化 Claude 文本回复
- [x] 5.3 格式化工具调用摘要（Edit, Bash, Read 等）
- [x] 5.4 添加状态指示器 emoji
- [x] 5.5 处理 Markdown 转义（Telegram HTML）

## 6. 双向桥接

- [x] 6.1 实现主桥接逻辑 (`src/bridge/index.ts`)
- [x] 6.2 Claude 输出 → Telegram 消息推送
- [x] 6.3 Telegram 回复 → Claude 输入注入
- [x] 6.4 处理并发和消息队列
- [ ] 6.5 实现心跳和状态检测 (基础版本已实现)

## 7. CLI 入口

- [x] 7.1 创建启动脚本 (`bin/claude-tg-bridge`)
- [x] 7.2 添加命令行参数解析 (--config, --working-dir)
- [x] 7.3 添加 --init 命令生成配置模板
- [x] 7.4 添加 package.json bin 入口

## 8. 错误处理和日志

- [x] 8.1 基础日志输出
- [ ] 8.2 网络断开重连机制 (依赖 node-telegram-bot-api 内置)
- [x] 8.3 Claude CLI 崩溃通知
- [x] 8.4 向 Telegram 发送错误通知

## 9. 测试和文档

- [ ] 9.1 编写单元测试（配置加载、消息格式化）
- [ ] 9.2 编写集成测试（模拟 Claude CLI 输出）
- [x] 9.3 编写 README.md 使用说明
- [x] 9.4 配置文件已创建
