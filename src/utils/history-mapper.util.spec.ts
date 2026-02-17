import { HistoryActionType } from '../enums/history.enum';
import { HistoryLogLike } from '../interfaces/history.interface';
import { HistoryMapper } from './history-mapper.util';
import { unflatten } from './object.util';

describe('HistoryMapper Utility', () => {


  describe('mapToEntity', () => {
    describe('CREATE logs', () => {
      const log: HistoryLogLike = {
        action: HistoryActionType.CREATE,
        content: { name: 'Alice', age: 30 },
      };

      it('should return payload for new side', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'new' });
        expect(result).toEqual({ name: 'Alice', age: 30 });
      });

      it('should return empty for old side', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'old' });
        expect(result).toEqual({});
      });

      it('should default to new side', () => {
        const result = HistoryMapper.mapToEntity(log);
        expect(result).toEqual({ name: 'Alice', age: 30 });
      });
    });

    describe('DELETE logs', () => {
      const log: HistoryLogLike = {
        action: HistoryActionType.DELETE,
        content: { name: 'Alice', age: 30 },
      };

      it('should return payload for old side', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'old' });
        expect(result).toEqual({ name: 'Alice', age: 30 });
      });

      it('should return empty for new side', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'new' });
        expect(result).toEqual({});
      });
    });

    describe('UPDATE logs (Diffs)', () => {
      const log: HistoryLogLike = {
        action: HistoryActionType.UPDATE,
        content: {
          'name': { old: 'Alice', new: 'Bob' },
          'profile.bio': { old: 'Hi', new: 'Hello' },
          'unchanged': 'Stay',
        },
      };

      it('should extract and unflatten new side', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'new' });
        expect(result).toEqual({
          name: 'Bob',
          profile: { bio: 'Hello' },
          unchanged: 'Stay',
        });
      });

      it('should extract and unflatten old side', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'old' });
        expect(result).toEqual({
          name: 'Alice',
          profile: { bio: 'Hi' },
          unchanged: 'Stay',
        });
      });

      it('should allow skipping unflattening', () => {
        const result = HistoryMapper.mapToEntity(log, { side: 'new', unflatten: false });
        expect(result).toEqual({
          'name': 'Bob',
          'profile.bio': 'Hello',
          'unchanged': 'Stay',
        });
      });
    });
  });

  describe('mapToUnified', () => {
    it('should handle CREATE logs', () => {
      const log: HistoryLogLike = {
        action: HistoryActionType.CREATE,
        content: { name: 'Alice', 'profile.bio': 'Hi' },
      };
      const result = HistoryMapper.mapToUnified(log);
      expect(result).toEqual({
        old: null,
        new: { name: 'Alice', profile: { bio: 'Hi' } },
      });
    });

    it('should handle DELETE logs', () => {
      const log: HistoryLogLike = {
        action: HistoryActionType.DELETE,
        content: { name: 'Alice', 'profile.bio': 'Hi' },
      };
      const result = HistoryMapper.mapToUnified(log);
      expect(result).toEqual({
        old: { name: 'Alice', profile: { bio: 'Hi' } },
        new: null,
      });
    });

    it('should handle UPDATE logs (side-by-side)', () => {
      const log: HistoryLogLike = {
        action: HistoryActionType.UPDATE,
        content: {
          'name': { old: 'Alice', new: 'Bob' },
          'profile.bio': { old: 'Hi', new: 'Hello' },
          'unchanged': 'Stay',
        },
      };
      const result = HistoryMapper.mapToUnified(log);
      expect(result).toEqual({
        old: { name: 'Alice', profile: { bio: 'Hi' }, unchanged: 'Stay' },
        new: { name: 'Bob', profile: { bio: 'Hello' }, unchanged: 'Stay' },
      });
    });
  });
});
