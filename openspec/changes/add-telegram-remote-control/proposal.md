# Change: Add Telegram Remote Control for Claude Code CLI

## Why

当前使用 Claude Code CLI 需要用户持续守在电脑前查看输出并输入指令。对于长时间运行的任务，用户希望能够通过移动设备远程监控和控制 Claude Code，无需物理接触电脑。

## What Changes

- **新增独立守护进程** `claude-tg-bridge`：作为 Claude CLI 和 Telegram Bot 之间的桥梁
- **新增消息推送机制**：将 Claude 的回复和工具调用摘要推送到 Telegram
- **新增远程输入机制**：通过 Telegram Bot 接收用户指令并注入到 Claude CLI
- **新增密码验证**：首次连接需要验证密码，确保只有授权用户可以控制
- **新增会话管理**：支持启动、暂停、恢复 Claude 会话

## Impact

- Affected specs: `telegram-bridge` (新建)
- Affected code:
  - 新建 `src/bridge/` 目录包含核心逻辑
  - 新建 `src/telegram/` 目录包含 Telegram Bot 集成
  - 新建 `bin/claude-tg-bridge` 启动脚本
  - 新建配置文件 `.claude-tg-bridge.json`
