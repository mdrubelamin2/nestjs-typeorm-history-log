import 'reflect-metadata';
import { filterHistoryPayload } from './filter-payload.util';
import { HistoryColumnExclude, HistoryColumnInclude } from '../decorators/history.decorator';

describe('filterHistoryPayload', () => {
  it('returns same payload when no ignored keys and no decorators (plain object)', () => {
    const payload = { name: 'x', age: 1 };
    expect(filterHistoryPayload({}, payload, new Set())).toEqual(payload);
  });

  it('filters out keys in ignoredKeys set', () => {
    const payload = { name: 'x', password: 'secret', updated_at: new Date() };
    const ignored = new Set(['password', 'updated_at']);
    expect(filterHistoryPayload({}, payload, ignored)).toEqual({ name: 'x' });
  });

  it('returns empty object when payload has only ignored keys', () => {
    const payload = { password: 'secret' };
    expect(filterHistoryPayload({}, payload, new Set(['password']))).toEqual({});
  });

  it('returns payload as-is when payload is empty', () => {
    expect(filterHistoryPayload({}, {}, new Set())).toEqual({});
  });

  it('returns payload as-is when payload is null/undefined', () => {
    expect(filterHistoryPayload({} as any, null as any, new Set())).toBeNull();
    expect(filterHistoryPayload({} as any, undefined as any, new Set())).toBeUndefined();
  });

  describe('with @HistoryColumnExclude', () => {
    class EntityWithExclude {
      name!: string;
      secret!: string;
    }
    HistoryColumnExclude()(EntityWithExclude.prototype, 'secret');

    it('excludes property marked with @HistoryColumnExclude', () => {
      const payload = { name: 'Alice', secret: 'do-not-log' };
      expect(filterHistoryPayload(EntityWithExclude, payload, new Set())).toEqual({ name: 'Alice' });
    });
  });

  describe('with @HistoryColumnInclude', () => {
    class EntityWithInclude {
      name!: string;
      updated_at!: string;
    }
    HistoryColumnInclude()(EntityWithInclude.prototype, 'updated_at');

    it('includes property marked with @HistoryColumnInclude even if in ignoredKeys', () => {
      const payload = { name: 'Alice', updated_at: '2024-01-01' };
      const ignored = new Set(['updated_at']);
      expect(filterHistoryPayload(EntityWithInclude, payload, ignored)).toEqual({
        name: 'Alice',
        updated_at: '2024-01-01',
      });
    });
  });
});
