import { loadConfig, initConfig } from './config.js';
import { Bridge } from './bridge/index.js';

export { loadConfig, initConfig } from './config.js';
export { Bridge } from './bridge/index.js';
export { ClaudeProcess } from './bridge/claude-process.js';
export { TelegramBotClient } from './telegram/bot.js';
export { SessionManager } from './session/index.js';
export * from './types.js';
export * from './constants.js';
export * from './session/types.js';

export function main(args: string[]): void {
  // 解析命令行参数
  const configPath = getArgValue(args, '--config', '-c');
  const workingDir = getArgValue(args, '--working-dir', '-d');

  if (args.includes('--init')) {
    try {
      const path = initConfig(configPath);
      console.log(`✅ 配置文件已创建: ${path}`);
      console.log('\n请编辑配置文件，填入您的 Telegram Bot Token 和密码。');
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // 加载配置并启动
  try {
    const config = loadConfig(configPath);

    if (workingDir) {
      config.claude.workingDirectory = workingDir;
    }

    const bridge = new Bridge(config);

    // 优雅退出
    process.on('SIGINT', () => {
      console.log('\n正在关闭...');
      bridge.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      bridge.stop();
      process.exit(0);
    });

    bridge.start();
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function getArgValue(args: string[], longFlag: string, shortFlag: string): string | undefined {
  const longIndex = args.indexOf(longFlag);
  if (longIndex !== -1 && args[longIndex + 1]) {
    return args[longIndex + 1];
  }

  const shortIndex = args.indexOf(shortFlag);
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return args[shortIndex + 1];
  }

  return undefined;
}

function printHelp(): void {
  console.log(`
claude-tg-bridge - Telegram 远程控制 Claude Code CLI（多会话版）

用法:
  claude-tg-bridge [选项]

选项:
  --init              生成配置文件模板
  -c, --config PATH   指定配置文件路径 (默认: ~/.claude-tg-bridge.json)
  -d, --working-dir   指定 Claude 默认工作目录
  -h, --help          显示帮助信息

环境变量:
  TELEGRAM_BOT_TOKEN  覆盖配置中的 Bot Token
  AUTH_PASSWORD       覆盖配置中的密码
  CLAUDE_WORKING_DIR  覆盖配置中的工作目录

Telegram 命令:
  /new [名称] [目录]  创建新会话
  /switch <ID|名称>   切换会话
  /list              列出所有会话
  /close [ID]        关闭会话
  /session           查看当前会话详情
  /status            查看状态

示例:
  claude-tg-bridge --init                    # 生成配置模板
  claude-tg-bridge                           # 使用默认配置启动
  claude-tg-bridge -d /path/to/project       # 指定默认工作目录
`);
}

// 如果直接运行此文件
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  main(process.argv.slice(2));
}
