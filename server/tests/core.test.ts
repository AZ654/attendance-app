import { describe, it, expect } from 'vitest';
import { haversineDistance } from '../src/lib/geo.js';
import { maskIdCard, maskPhone, encrypt, decrypt, hashPassword, verifyPassword } from '../src/lib/crypto.js';

describe('考勤距离计算', () => {
  it('相同坐标距离为 0', () => {
    expect(haversineDistance(22.5431, 114.0579, 22.5431, 114.0579)).toBeLessThan(0.1);
  });
  it('约 1 度纬度 ≈ 111km', () => {
    const d = haversineDistance(22.0, 114.0, 23.0, 114.0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});

describe('脱敏', () => {
  it('手机号脱敏保留前 3 后 4', () => {
    expect(maskPhone('13800138000')).toBe('138****8000');
  });
  it('身份证脱敏保留前 4 后 4', () => {
    const masked = maskIdCard('440301199001011234');
    expect(masked.startsWith('4403')).toBe(true);
    expect(masked.endsWith('1234')).toBe(true);
    expect(masked).not.toContain('19900101');
  });
});

describe('账号密码哈希', () => {
  it('正确密码验证通过、错误密码验证失败', () => {
    const { salt, hash } = hashPassword('StrongPass123');
    expect(verifyPassword('StrongPass123', salt, hash)).toBe(true);
    expect(verifyPassword('wrong-password', salt, hash)).toBe(false);
  });
  it('相同密码两次加盐结果不同', () => {
    expect(hashPassword('StrongPass123').salt).not.toBe(hashPassword('StrongPass123').salt);
  });
});

describe('敏感信息加密', () => {
  it('加密后与明文不同且可解密还原', () => {
    const plain = '440301199001011234';
    const cipher = encrypt(plain);
    expect(cipher).not.toBe(plain);
    expect(decrypt(cipher)).toBe(plain);
  });
  it('相同明文两次加密结果不同（IV 随机）', () => {
    expect(encrypt('x')).not.toBe(encrypt('x'));
  });
});
