import type { SQLOutputValue } from 'node:sqlite';

type Row = Record<string, SQLOutputValue>;

/** node:sqlite 返回 Object:null-prototype 行，统一转换为目标类型。 */
export function rowsAs<T>(rows: Row[]): T[] {
  return rows as unknown as T[];
}

export function rowAs<T>(row: Row | undefined): T | undefined {
  return row as unknown as T | undefined;
}
