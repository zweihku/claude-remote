/**
 * 文本处理工具函数
 */

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 截断文本到指定长度
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * 智能分割长文本
 * 优先在换行处分割，避免截断单词
 */
export function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 尝试在换行处分割
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // 如果没有合适的换行，尝试在空格处分割
      splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        // 最后手段：硬截断
        splitIndex = maxLength;
      }
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * 格式化时间间隔为可读字符串
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  }
  if (minutes > 0) {
    return `${minutes}分钟`;
  }
  return `${seconds}秒`;
}

/**
 * 格式化数字，添加千分位
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}
