/**
 * 命令行创建/重置电脑端账号。
 *
 * 用法：
 *   npm run account:create -- --username admin --password 'StrongPass123' --role admin
 *   npm run account:create -- --username zhangsan --password 'StrongPass123' --nickname 张三
 *
 * 账号已存在时仅重置密码（并可按 --role 调整角色），不会新建重复账号。
 */
import { initSchema, db } from '../src/db/index.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { createAccountSchema, normalizeUsername } from '../src/modules/auth/auth.schema.js';
import { createLocalAccount, resetAccountPassword } from '../src/modules/auth/auth.service.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const raw = {
    username: arg('username') ?? '',
    password: arg('password') ?? '',
    nickname: arg('nickname'),
    role: arg('role'),
  };
  const input = createAccountSchema.parse({
    ...raw,
    role: raw.role === undefined ? undefined : raw.role,
  });

  initSchema();
  const username = normalizeUsername(input.username);
  const existing = authRepository.findUserByUsername(username);
  if (existing) {
    const updated = resetAccountPassword(existing.id, input.password);
    if (input.role && input.role !== updated.role) authRepository.setRole(existing.id, input.role);
    console.log(`[account] 已重置账号 ${username} 的密码（ID: ${existing.id}）`);
  } else {
    const created = createLocalAccount({ ...input, username });
    console.log(`[account] 已创建账号 ${username}（角色: ${created.role}，ID: ${created.id}）`);
  }
  db.close();
}

try {
  main();
} catch (err) {
  console.error('[account] 创建失败：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
