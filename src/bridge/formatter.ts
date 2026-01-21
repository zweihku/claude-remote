/**
 * 消息格式化工具
 */

import type { ClaudeMessage } from '../types.js';
import type { SessionListItem } from '../session/types.js';
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

/**
 * 格式化会话列表
 */
export function formatSessionList(sessions: SessionListItem[]): string {
  if (sessions.length === 0) {
    return '📋 <b>会话列表</b>\n\n暂无会话，使用 /new 创建';
  }

  let result = '📋 <b>会话列表</b>\n';

  for (const session of sessions) {
    const activeMarker = session.isActive ? '→ ' : '  ';
    const statusIcon = getStatusIcon(session.status, session.isActive);
    const statusText = getStatusText(session.status);

    result += `\n${activeMarker}<b>[${session.id}]</b> ${escapeHtml(session.name)} ${statusIcon}\n`;
    result += `    📁 <code>${escapeHtml(shortenPath(session.workingDirectory))}</code>\n`;
    result += `    💬 ${session.messageCount}条消息 | ⏱ ${session.runningMinutes}分钟 | ${statusText}\n`;
  }

  return result;
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: string, isActive: boolean): string {
  if (status === 'busy') return '🔄';
  if (isActive) return '🟢';
  if (status === 'stopped') return '🔴';
  return '💤';
}

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
  switch (status) {
    case 'busy': return '处理中';
    case 'stopped': return '已停止';
    default: return '空闲';
  }
}

/**
 * 缩短路径显示
 */
function shortenPath(path: string): string {
  // 替换 home 目录为 ~
  const home = process.env.HOME || '';
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

/**
 * 格式化会话切换提示
 */
export function formatSessionSwitch(sessionId: number, sessionName: string): string {
  return `✅ 已切换到会话 <b>[${sessionId}]</b> ${escapeHtml(sessionName)}`;
}

/**
 * 格式化会话创建提示
 */
export function formatSessionCreated(sessionId: number, sessionName: string, workingDir: string): string {
  return `✅ 已创建会话 <b>[${sessionId}]</b> ${escapeHtml(sessionName)}\n📁 <code>${escapeHtml(shortenPath(workingDir))}</code>`;
}

/**
 * 格式化会话关闭提示
 */
export function formatSessionClosed(sessionId: number, sessionName: string): string {
  return `🗑 已关闭会话 <b>[${sessionId}]</b> ${escapeHtml(sessionName)}`;
}

/**
 * 格式化带会话标识的消息
 */
export function formatWithSessionTag(sessionId: number, sessionName: string, message: string): string {
  return `<b>[${sessionId}:${escapeHtml(sessionName)}]</b> ${message}`;
}
