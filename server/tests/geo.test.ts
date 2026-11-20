import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { wgs84ToGcj02 } from '../src/lib/coord.js';
import { computeAmapSignature, formatAmapAddress } from '../src/lib/geocoder.js';

describe('WGS-84 → GCJ-02 坐标转换', () => {
  it('中国境内坐标会产生合理偏移（几百米量级）', () => {
    const r = wgs84ToGcj02(116.397428, 39.90923);
    expect(r.lng).toBeGreaterThan(116.39);
    expect(r.lng).toBeLessThan(116.41);
    expect(r.lat).toBeGreaterThan(39.90);
    expect(r.lat).toBeLessThan(39.92);
    expect(r.lng - 116.397428).toBeGreaterThan(0.004);
    expect(r.lat - 39.90923).toBeGreaterThan(0.0005);
  });

  it('境外坐标原样返回（不转换）', () => {
    const r = wgs84ToGcj02(-122.4194, 37.7749);
    expect(r.lng).toBe(-122.4194);
    expect(r.lat).toBe(37.7749);
  });

  it('转换结果稳定可复现', () => {
    const a = wgs84ToGcj02(114.0579, 22.5431);
    const b = wgs84ToGcj02(114.0579, 22.5431);
    expect(a).toEqual(b);
  });
});

describe('高德 WebService 数字签名算法', () => {
  it('按官方规则：参数升序拼接 + 私钥，取 MD5 小写', () => {
    const params = { b: '12', a: '23', key: 'TESTKEY' };
    const secret = 'bbbbb';
    const expected = createHash('md5').update('a=23&b=12&key=TESTKEYbbbbb', 'utf8').digest('hex');
    expect(computeAmapSignature(params, secret)).toBe(expected);
  });

  it('未配置私钥时返回 null（不签名）', () => {
    expect(computeAmapSignature({ key: 'K', location: '1,2' }, '')).toBeNull();
  });

  it('参数顺序不影响结果（内部按名排序）', () => {
    const p1 = { key: 'K', location: '1,2' };
    const p2 = { location: '1,2', key: 'K' };
    expect(computeAmapSignature(p1, 'S')).toBe(computeAmapSignature(p2, 'S'));
  });
});

describe('高德地址格式化', () => {
  it('拼接省市区乡镇街道门牌', () => {
    const address = formatAmapAddress({
      formatted_address: '广东省深圳市南山区',
      addressComponent: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        township: '粤海街道',
        streetNumber: { street: '科技园路', number: '1号' },
      },
    });
    expect(address).toBe('广东省深圳市南山区粤海街道科技园路1号');
  });

  it('地址元素缺失时回退到 formatted_address', () => {
    const address = formatAmapAddress({
      formatted_address: '北京市朝阳区',
      addressComponent: {},
    });
    expect(address).toBe('北京市朝阳区');
  });

  it('过滤数组类型的空值字段', () => {
    const address = formatAmapAddress({
      formatted_address: '测试地址',
      addressComponent: {
        province: '河南省',
        city: '郑州市',
        district: '金水区',
        streetNumber: { street: [] as never, number: [] as never },
      },
    });
    expect(address).toBe('河南省郑州市金水区');
  });
});
