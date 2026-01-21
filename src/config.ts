import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TelegramConfig {
  botToken: string;
  authPassword: string;
}

export interface ClaudeConfig {
  workingDirectory: string;
  additionalArgs: string[];
  cliPath?: string;  // 可选的 Claude CLI 路径
}

export interface Config {
  telegram: TelegramConfig;
  claude: ClaudeConfig;
}

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.claude-tg-bridge.json');

const CONFIG_TEMPLATE: Config = {
  telegram: {
    botToken: 'YOUR_BOT_TOKEN_HERE',
    authPassword: 'YOUR_SECRET_PASSWORD',
  },
  claude: {
    workingDirectory: process.cwd(),
    additionalArgs: [],
  },
};

export function getConfigPath(customPath?: string): string {
  return customPath || DEFAULT_CONFIG_PATH;
}

export function loadConfig(configPath?: string): Config {
  const filePath = getConfigPath(configPath);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `配置文件不存在: ${filePath}\n运行 'claude-tg-bridge --init' 生成配置模板`
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let config: Config;

  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`配置文件格式错误: ${filePath}`);
  }

  // 环境变量覆盖
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
  }
  if (process.env.AUTH_PASSWORD) {
    config.telegram.authPassword = process.env.AUTH_PASSWORD;
  }
  if (process.env.CLAUDE_WORKING_DIR) {
    config.claude.workingDirectory = process.env.CLAUDE_WORKING_DIR;
  }

  // 验证必要字段
  validateConfig(config);

  return config;
}

function validateConfig(config: Config): void {
  if (!config.telegram?.botToken || config.telegram.botToken === 'YOUR_BOT_TOKEN_HERE') {
    throw new Error('请配置有效的 telegram.botToken');
  }
  if (!config.telegram?.authPassword || config.telegram.authPassword === 'YOUR_SECRET_PASSWORD') {
    throw new Error('请配置 telegram.authPassword');
  }
  if (!config.claude?.workingDirectory) {
    config.claude = config.claude || {};
    config.claude.workingDirectory = process.cwd();
  }
  if (!config.claude?.additionalArgs) {
    config.claude.additionalArgs = [];
  }
}

export function initConfig(configPath?: string): string {
  const filePath = getConfigPath(configPath);

  if (fs.existsSync(filePath)) {
    throw new Error(`配置文件已存在: ${filePath}`);
  }

  fs.writeFileSync(filePath, JSON.stringify(CONFIG_TEMPLATE, null, 2), 'utf-8');
  return filePath;
}
