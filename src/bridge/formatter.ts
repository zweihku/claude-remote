/**
 * 消息格式化工具
 */

import type { ClaudeMessage } from '../types.js';
import { TELEGRAM } from '../constants.js';
import { escapeHtml, truncateText } from '../utils/text.js';

/**
 * 格式化 Claude 消息用于 Telegram 显示
 */
export function formatClaudeMessage(msg: ClaudeMessage): string | null {
  if (msg.type === 'result') {
    return formatResult(msg);
  }
  return null;
}

/**
 * 格式化结果消息
 */
function formatResult(msg: ClaudeMessage): string | null {
  if (msg.subtype === 'success') {
    const result = msg.result;
    if (result) {
      const truncated = truncateText(result, TELEGRAM.MAX_CONTENT_LENGTH);
      return `✅ <b>完成</b>\n\n${escapeHtml(truncated)}`;
    }
    return '✅ <b>任务完成</b>';
  }

  if (msg.subtype === 'error') {
    return `❌ <b>错误:</b> ${escapeHtml(msg.result || 'Unknown error')}`;
  }

  return null;
}

/**
 * 格式化状态信息
 */
export function formatStatus(isRunning: boolean, workingDir: string): string {
  const status = isRunning ? '🟢 就绪' : '🔴 已停止';
  return `📊 <b>状态</b>\n\nClaude: ${status}\n工作目录: <code>${escapeHtml(workingDir)}</code>`;
}

/**
 * 格式化错误信息
 */
export function formatError(error: string): string {
  return `⚠️ <b>错误:</b> ${escapeHtml(error)}`;
}

/**
 * 格式化通知消息
 */
export function formatNotification(message: string): string {
  return `📢 ${message}`;
}
