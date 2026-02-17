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
    // Now that we support CREATE, this should log a creation for 'a'
    expect(result).toEqual({
      a: { old: null, new: 1 },
    });
  });

  it('handles null/undefined newData', () => {
    const result = generateDiff({ a: 1 }, null as any);
    // Now that we support REMOVE, this should log a removal for 'a'
    expect(result).toEqual({
      a: { old: 1, new: null },
    });
  });

  it('handles CREATE (new property)', () => {
    const oldData = { a: 1 };
    const newData = { a: 1, b: 2 };
    expect(generateDiff(oldData, newData)).toEqual({
      b: { old: null, new: 2 },
    });
  });

  it('handles REMOVE (deleted property)', () => {
    const oldData = { a: 1, b: 2 };
    const newData = { a: 1 };
    expect(generateDiff(oldData, newData)).toEqual({
      b: { old: 2, new: null },
    });
  });

  it('escapes keys containing dots', () => {
    const oldData = { 'ver.1': 'active' };
    const newData = { 'ver.1': 'inactive' };

    // Key should be escaped: ver\.1
    const result = generateDiff(oldData, newData);
    const expectedKey = 'ver\\.1';

    expect(result[expectedKey]).toBeDefined();
    expect(result[expectedKey]).toEqual({ old: 'active', new: 'inactive' });
  });

  it('escapes nested keys containing dots', () => {
    const oldData = { meta: { 'ver.1': 'active' } };
    const newData = { meta: { 'ver.1': 'inactive' } };

    // Key should be escaped: meta.ver\.1
    const result = generateDiff(oldData, newData);
    const expectedKey = 'meta.ver\\.1';

    expect(result[expectedKey]).toBeDefined();
    expect(result[expectedKey]).toEqual({ old: 'active', new: 'inactive' });
  });
});
