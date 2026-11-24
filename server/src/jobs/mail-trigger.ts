import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * 邮件即时触发器。
 *
 * 背景：Railway Hobby 屏蔽 SMTP 端口，邮件实际由 GitHub Actions 中继（每 5 分钟 cron）发送。
 * GitHub cron 最短周期为 5 分钟，无法再缩短。因此在打卡入队后主动调用 GitHub API
 * 触发一次 workflow_dispatch，让中继立即领取并发送，把延迟从最多 5 分钟降到约 20-60 秒。
 *
 * 设计要点：
 * - 可选开关：未配置 GITHUB_TOKEN / GITHUB_REPO 时静默跳过，完全退化为原 cron 行为，不破坏现状。
 * - 节流合并：短时间内多次打卡合并为一次触发（中继一次可领取多条），避免频繁触发 Actions
 *   耗尽免费额度或触发 GitHub 限流；被合并的邮件最迟在冷却期后补触发一次。
 * - cron 仍是兜底：即使触发失败（token 过期、网络异常、Actions 排队），邮件也不会丢。
 */

const COOLDOWN_MS = 15_000;

let lastFireAt = 0;
let firing = false;
let wanted = false;
let timer: NodeJS.Timeout | null = null;

/** 诊断用：最近一次触发 GitHub 中继的结果（不含密钥）。 */
export const triggerDiagnostics = {
  fireCount: 0,
  lastFireAt: 0,
  lastStatus: 0,
  lastError: '',
};

function schedule(): void {
  if (timer) return;
  const delay = Math.max(0, COOLDOWN_MS - (Date.now() - lastFireAt));
  timer = setTimeout(() => {
    timer = null;
    void pump();
  }, delay);
  timer.unref?.();
}

async function pump(): Promise<void> {
  if (firing) {
    // 发送触发请求期间又有新入队，标记待补触发
    wanted = true;
    return;
  }
  if (!wanted) return;
  if (Date.now() - lastFireAt < COOLDOWN_MS) {
    schedule();
    return;
  }

  wanted = false;
  lastFireAt = Date.now();
  firing = true;

  const url = `https://api.github.com/repos/${config.githubRepo}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/dispatches`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: config.githubRef }),
      signal: AbortSignal.timeout(8000),
    });
    triggerDiagnostics.fireCount += 1;
    triggerDiagnostics.lastFireAt = Date.now();
    triggerDiagnostics.lastStatus = res.status;
    if (res.ok || res.status === 204) {
      triggerDiagnostics.lastError = '';
      logger.info('已触发邮件中继立即发送');
    } else {
      const text = await res.text().catch(() => '');
      triggerDiagnostics.lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      logger.warn({ status: res.status, body: text.slice(0, 200) }, '触发邮件中继失败，等待 cron 兜底');
    }
  } catch (err) {
    triggerDiagnostics.fireCount += 1;
    triggerDiagnostics.lastFireAt = Date.now();
    triggerDiagnostics.lastStatus = -1;
    triggerDiagnostics.lastError = String(err instanceof Error ? err.message : err).slice(0, 200);
    logger.warn({ err: String(err instanceof Error ? err.message : err) }, '触发邮件中继异常，等待 cron 兜底');
  } finally {
    firing = false;
    if (wanted) schedule();
  }
}

/**
 * 有新邮件入队时调用：异步触发一次中继。
 * 未开启中继模式或未配置 GitHub Token 时静默返回（保持原 cron 行为）。
 */
export function notifyMailRelay(): void {
  if (!config.mailRelayEnabled) return;
  if (!config.githubToken || !config.githubRepo) return;
  wanted = true;
  schedule();
}
