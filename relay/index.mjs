// 一次性清理脚本：领取积压邮件后直接标记为已处理（丢弃，不再发送，也不进死信）。
// 用完必须立即恢复原始发送脚本（relay/index.mjs.bak）。
const API_BASE = (process.env.API_BASE || 'https://resilient-flexibility-production-150d04fe.up.railway.app/api').replace(/\/$/, '');
const TOKEN = process.env.MAIL_RELAY_TOKEN || '';

if (!TOKEN) {
  console.error('缺少 MAIL_RELAY_TOKEN，请检查 GitHub Secrets');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'x-relay-token': TOKEN,
};

async function claimJobs() {
  const response = await fetch(`${API_BASE}/mail-relay/claim?limit=50`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`领取邮件失败 ${response.status}: ${text}`);
  return JSON.parse(text).jobs ?? [];
}

async function reportDropped(sentIds) {
  const response = await fetch(`${API_BASE}/mail-relay/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sentIds, failures: [] }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`回报结果失败 ${response.status}: ${text}`);
}

let totalDropped = 0;
let rounds = 0;
while (rounds < 30) {
  rounds += 1;
  let jobs;
  try {
    jobs = await claimJobs();
  } catch (error) {
    console.error('领取失败:', error.message);
    break;
  }
  if (!jobs.length) {
    console.log('没有待发送邮件，清理结束');
    break;
  }
  const sentIds = jobs.map((j) => j.id);
  try {
    await reportDropped(sentIds);
    totalDropped += sentIds.length;
    console.log(`第 ${rounds} 轮：丢弃 ${sentIds.length} 封，累计 ${totalDropped}`);
  } catch (error) {
    console.error('回报失败，停止清理:', error.message);
    break;
  }
}
console.log(`清理完成：累计丢弃 ${totalDropped} 封积压邮件`);
