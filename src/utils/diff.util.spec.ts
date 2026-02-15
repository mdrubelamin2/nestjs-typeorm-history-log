import { generateDiff } from './diff.util';

describe('generateDiff', () => {
  it('returns empty object when both inputs are empty', () => {
    expect(generateDiff({}, {})).toEqual({});
  });

  it('returns empty object when old and new are the same', () => {
    const data = { a: 1, b: 'two' };
    expect(generateDiff(data, { ...data })).toEqual({});
  });

  it('returns diff for a single changed property', () => {
    const oldData = { name: 'Alice', age: 30 };
    const newData = { name: 'Bob', age: 30 };
    expect(generateDiff(oldData, newData)).toEqual({
      name: { old: 'Alice', new: 'Bob' },
    });
  });

  it('returns diff for multiple changed properties', () => {
    const oldData = { a: 1, b: 2, c: 3 };
    const newData = { a: 10, b: 20, c: 3 };
    expect(generateDiff(oldData, newData)).toEqual({
      a: { old: 1, new: 10 },
      b: { old: 2, new: 20 },
    });
  });

  it('handles nested path in diff', () => {
    const oldData = { settings: { theme: 'light' } };
    const newData = { settings: { theme: 'dark' } };
    const result = generateDiff(oldData, newData);
    expect(Object.keys(result)).toContain('settings.theme');
    expect(result['settings.theme']).toEqual({ old: 'light', new: 'dark' });
  });

  it('handles null/undefined oldData', () => {
    const result = generateDiff(null as any, { a: 1 });
    expect(result).toEqual({});
  });

  it('handles null/undefined newData', () => {
    const result = generateDiff({ a: 1 }, null as any);
    expect(result).toEqual({});
  });
});
