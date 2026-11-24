import nodemailer from 'nodemailer';

// 一次性清理脚本：把积压邮件领取后直接标记为已处理（丢弃），不再发送。
// 用 report 的 sentIds 回报，邮件进入 sent 状态，永不再领取/发送，也不进死信。

const API_BASE = (process.env.API_BASE || 'https://resilient-flexibility-production-150d04fe.up.railway.app/api').replace(/\/$/, '');
const TOKEN = process.env.MAIL_RELAY_TOKEN || '';

if (!TOKEN) {
  console.error('缺少 MAIL_RELAY_TOKEN，请检查 GitHub Secrets');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', 'x-relay-token': TOKEN };
const LIMIT = 50;

async function claim() {
  const res = await fetch(`${API_BASE}/mail-relay/claim?limit=${LIMIT}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`领取失败 ${res.status}: ${text}`);
  return JSON.parse(text).jobs ?? [];
}

async function discard(ids) {
  const res = await fetch(`${API_BASE}/mail-relay/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sentIds: ids, failures: [] }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`回报失败 ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

let total = 0;
for (let round = 1; round <= 20; round += 1) {
  const jobs = await claim();
  if (!jobs.length) {
    console.log(`清理完成：无更多积压。累计丢弃 ${total} 封。`);
    break;
  }
  const ids = jobs.map((j) => j.id);
  await discard(ids);
  total += ids.length;
  console.log(`第 ${round} 轮：丢弃 ${ids.length} 封，累计 ${total}`);
}

console.log(`清理脚本结束，共丢弃 ${total} 封积压邮件（标记为已处理，不再发送）。`);
