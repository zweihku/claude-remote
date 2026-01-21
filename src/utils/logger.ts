/**
 * 简单日志模块
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = 'info';
  private prefix: string = '';

  constructor(prefix?: string) {
    this.prefix = prefix || '';

    // 从环境变量读取日志级别
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
      this.level = envLevel;
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(tag: string, args: unknown[]): string[] {
    const timestamp = new Date().toISOString().slice(11, 19);
    const prefix = this.prefix ? `${this.prefix}${tag}` : tag;
    return [`[${timestamp}] ${prefix}`, ...args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    )];
  }

  debug(tag: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(...this.formatMessage(tag, args));
    }
  }

  info(tag: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(...this.formatMessage(tag, args));
    }
  }

  warn(tag: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage(tag, args));
    }
  }

  error(tag: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage(tag, args));
    }
  }

  /**
   * 创建带有特定前缀的子 logger
   */
  child(prefix: string): Logger {
    const child = new Logger(prefix);
    child.setLevel(this.level);
    return child;
  }
}

// 导出单例
export const logger = new Logger();

// 也导出类，方便创建独立实例
export { Logger };
