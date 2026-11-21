import nodemailer from 'nodemailer';

const API_BASE = (process.env.API_BASE || 'https://resilient-flexibility-production-150d04fe.up.railway.app/api').replace(/\/$/, '');
const TOKEN = process.env.MAIL_RELAY_TOKEN || '';
const LIMIT = Number.parseInt(process.env.MAIL_RELAY_LIMIT || '10', 10);
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qq.com';
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || `考勤系统 <${SMTP_USER}>`;

if (!TOKEN || !SMTP_USER || !SMTP_PASS) {
  console.error('缺少 MAIL_RELAY_TOKEN / SMTP_USER / SMTP_PASS，请检查 GitHub Secrets');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'x-relay-token': TOKEN,
};

async function claimJobs() {
  const response = await fetch(`${API_BASE}/mail-relay/claim?limit=${LIMIT}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`领取邮件失败 ${response.status}: ${text}`);
  return JSON.parse(text).jobs ?? [];
}

async function reportResult(sentIds, failures) {
  const response = await fetch(`${API_BASE}/mail-relay/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sentIds, failures }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`回报发送结果失败 ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const jobs = await claimJobs();
if (!jobs.length) {
  console.log('没有待发送邮件');
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
});

const sentIds = [];
const failures = [];
for (const job of jobs) {
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: job.to,
      subject: job.subject,
      html: job.html,
    });
    sentIds.push(job.id);
  } catch (error) {
    failures.push({
      id: job.id,
      error: String(error instanceof Error ? error.message : error).slice(0, 800),
    });
  }
}

try {
  const result = await reportResult(sentIds, failures);
  console.log(`邮件中继完成：领取 ${jobs.length}，成功 ${sentIds.length}，失败 ${failures.length}`, result);
} catch (error) {
  console.error('回报发送结果失败，任务将在锁定期后重新入队：', error.message);
  process.exitCode = 1;
}
