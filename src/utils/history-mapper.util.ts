import { ObjectLiteral } from 'typeorm';
import { HistoryActionType } from '../enums/history.enum';
import { HistoryLogLike, UnifiedHistoryContent } from '../interfaces/history.interface';
import { unflatten } from './object.util';

export interface MapToEntityOptions {
  /**
   * Which side of the change to extract.
   * 'new' (default) returns the state AFTER the change.
   * 'old' returns the state BEFORE the change.
   */
  side?: 'old' | 'new';
  /**
   * Whether to unflatten dot-notated keys (relevant for UPDATE logs).
   * Default is true.
   */
  unflatten?: boolean;
}

/**
 * Utility to map history log content back to typed entity partials.
 * Designed to be pure TypeScript for use in both frontend and backend.
 */
export class HistoryMapper {
  /**
   * Casts a history log back into a typed Partial<T>.
   *
   * @template T - The entity type to cast to.
   * @param log - The history log instance (or duck-typed object).
   * @param options - Mapping options (side, unflatten).
   * @returns A partial of T representing the captured state.
   */
  static mapToEntity<T = unknown>(
    log: HistoryLogLike,
    options: MapToEntityOptions = {},
  ): Partial<T> {
    const action = log.action;
    const content = log.content || {};
    const side = options.side || 'new';
    const shouldUnflatten = options.unflatten !== false;

    if (action === HistoryActionType.UPDATE) {
      const extracted = this.extractFromDiff(content, side);
      return (shouldUnflatten ? unflatten(extracted) : extracted) as Partial<T>;
    }

    // For CREATE, 'new' side contains the payload. 'old' is empty.
    if (action === HistoryActionType.CREATE) {
      return (side === 'new' ? content : {}) as Partial<T>;
    }

    // For DELETE, 'old' side contains the state before removal. 'new' is empty.
    if (action === HistoryActionType.DELETE) {
      return (side === 'old' ? content : {}) as Partial<T>;
    }

    return {} as Partial<T>;
  }

  /**
   * Internal helper to extract one side ('old' or 'new') from a diff object.
   */
  private static extractFromDiff(content: ObjectLiteral, side: 'old' | 'new'): ObjectLiteral {
    const result: ObjectLiteral = {};

    for (const key of Object.keys(content)) {
      const val = content[key];
      if (val && typeof val === 'object' && ('old' in val || 'new' in val)) {
        if (side === 'new' && 'new' in val) {
          result[key] = val.new;
        } else if (side === 'old' && 'old' in val) {
          result[key] = val.old;
        }
      } else {
        // Fallback for unexpected shapes or mixed content
        result[key] = val;
      }
    }

    return result;
  }

  /**
   * Transforms a history log into a unified side-by-side view.
   *
   * @template T - The entity type.
   * @param log - The history log instance.
   * @returns A unified view: { old: Partial<T> | null, new: Partial<T> | null }
   */
  static mapToUnified<T = unknown>(
    log: HistoryLogLike,
  ): UnifiedHistoryContent<T> {
    const action = log.action;
    const content = log.content || {};

    if (action === HistoryActionType.CREATE) {
      return {
        old: null,
        new: unflatten(content) as Partial<T>,
      };
    }

    if (action === HistoryActionType.DELETE) {
      return {
        old: unflatten(content) as Partial<T>,
        new: null,
      };
    }

    if (action === HistoryActionType.UPDATE) {
      return {
        old: unflatten(this.extractFromDiff(content, 'old')) as Partial<T>,
        new: unflatten(this.extractFromDiff(content, 'new')) as Partial<T>,
      };
    }

    return { old: null, new: null };
  }
}
