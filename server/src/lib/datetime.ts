/**
 * 统一时间格式化：服务端运行在 UTC 容器（Railway 默认），而用户看到的是北京时间。
 * 所有写进给邮件/通知的可读时间都必须用这里的方法，避免服务器时区导致差 8 小时。
 */
const TZ = 'Asia/Shanghai';

/** 北京时间可读串，格式与浏览器 toLocaleString('zh-CN') 一致：2026/11/24 11:01:59 */
export function formatBeijingTime(epochMs: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(epochMs));
}
