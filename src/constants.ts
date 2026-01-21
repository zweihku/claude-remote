/**
 * 应用常量配置
 */

import * as os from 'os';
import * as path from 'path';

// Claude CLI 相关常量
export const CLAUDE = {
  // 默认 CLI 路径
  DEFAULT_PATH: path.join(os.homedir(), '.local', 'bin', 'claude'),

  // 进程重启延迟（毫秒）
  RESTART_DELAY_MS: 3000,

  // 重启后等待时间（毫秒）
  RESTART_WAIT_MS: 500,

  // 默认启动参数
  DEFAULT_ARGS: [
    '--dangerously-skip-permissions',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--print',
    '--verbose'
  ] as const,
} as const;

// Telegram 相关常量
export const TELEGRAM = {
  // 单条消息最大长度
  MAX_MESSAGE_LENGTH: 4000,

  // 格式化内容最大长度（截断用）
  MAX_CONTENT_LENGTH: 2000,
} as const;

// 日志标签
export const LOG_TAGS = {
  CLAUDE: '[Claude]',
  TELEGRAM: '[TG]',
  BRIDGE: '[Bridge]',
} as const;
