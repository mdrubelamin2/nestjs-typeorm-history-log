import { unflatten, set, parsePath } from './object.util';

describe('Object Util', () => {
  describe('parsePath', () => {
    it('should split simple dot paths', () => {
      expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle escaped dots correctly (no splitting)', () => {
      // "ver\.1" should become one segment: "ver.1"
      expect(parsePath('ver\\.1')).toEqual(['ver.1']);
    });

    it('should handle mixed escaped and unescaped dots', () => {
      // "meta.ver\.1" should become segments: ["meta", "ver.1"]
      expect(parsePath('meta.ver\\.1')).toEqual(['meta', 'ver.1']);
    });
  });

  describe('set', () => {
    it('should set value at simple path', () => {
      const obj = {};
      set(obj, ['a'], 1);
      expect(obj).toEqual({ a: 1 });
    });

    it('should create nested objects for deep path', () => {
      const obj = {};
      set(obj, ['a', 'b', 'c'], 1);
      expect(obj).toEqual({ a: { b: { c: 1 } } });
    });
  });

  describe('unflatten', () => {
    it('should unflatten a simple flat object', () => {
      const data = { 'user.name': 'Alice', 'user.age': 30 };
      const expected = { user: { name: 'Alice', age: 30 } };
      expect(unflatten(data)).toEqual(expected);
    });

    it('should unflatten deeply nested keys', () => {
      const data = { 'a.b.c.d': 1 };
      const expected = { a: { b: { c: { d: 1 } } } };
      expect(unflatten(data)).toEqual(expected);
    });

    it('should maintain existing structures when unflattening', () => {
      const data = { 'user.name': 'Alice', 'user.settings.theme': 'dark' };
      const expected = { user: { name: 'Alice', settings: { theme: 'dark' } } };
      expect(unflatten(data)).toEqual(expected);
    });

    it('should handle escaped dots correctly (no splitting)', () => {
      const data = { 'ver\\.1': 'active', 'meta.ver\\.1': 'beta' };
      // "ver\.1" should become key "ver.1", not { ver: { 1: ... } }
      // "meta.ver\.1" should become { meta: { "ver.1": ... } }
      const expected = {
        'ver.1': 'active',
        meta: {
          'ver.1': 'beta',
        },
      };
      expect(unflatten(data)).toEqual(expected);
    });
  });
});
