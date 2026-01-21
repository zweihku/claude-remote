import type { ClaudeMessage } from './claude-process.js';

const MAX_CONTENT_LENGTH = 2000;

export function formatClaudeMessage(msg: ClaudeMessage): string | null {
  if (msg.type === 'result') {
    return formatResult(msg);
  }
  return null;
}

function formatResult(msg: ClaudeMessage): string | null {
  if (msg.subtype === 'success') {
    const result = msg.result;
    if (typeof result === 'string' && result) {
      return `✅ <b>完成</b>\n\n${escapeHtml(truncateText(result, MAX_CONTENT_LENGTH))}`;
    }
    return '✅ <b>任务完成</b>';
  }

  if (msg.subtype === 'error') {
    const result = msg.result;
    return `❌ <b>错误:</b> ${escapeHtml(String(result || 'Unknown error'))}`;
  }

  return null;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatStatus(isRunning: boolean, workingDir: string): string {
  const status = isRunning ? '🟢 就绪' : '🔴 已停止';
  return `📊 <b>状态</b>\n\nClaude: ${status}\n工作目录: <code>${escapeHtml(workingDir)}</code>`;
}

export function formatError(error: string): string {
  return `⚠️ <b>错误:</b> ${escapeHtml(error)}`;
}

export function formatNotification(message: string): string {
  return `📢 ${message}`;
}
