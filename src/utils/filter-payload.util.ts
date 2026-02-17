import 'reflect-metadata';
import {
  HISTORY_COLUMN_EXCLUDE_KEY,
  HISTORY_COLUMN_INCLUDE_KEY,
} from '../history.constants';

export function filterHistoryPayload(
  entityTarget: object,
  payload: Record<string, unknown>,
  ignoredKeys: Set<string> = new Set()
): Record<string, unknown> {
  if (!payload || (Object.keys(payload).length === 0)) return payload;

  const filtered: Record<string, unknown> = {};

  // If entityTarget is a constructor, use prototype for property metadata lookups
  const prototype = typeof entityTarget === 'function' ? entityTarget.prototype : entityTarget;

  for (const key of Object.keys(payload)) {
    let shouldInclude = true;

    const isExcluded = Reflect.getMetadata(HISTORY_COLUMN_EXCLUDE_KEY, prototype as object, key) === true;
    const isIncluded = Reflect.getMetadata(HISTORY_COLUMN_INCLUDE_KEY, prototype as object, key) === true;

    if (isExcluded) {
      shouldInclude = false;
    } else if (isIncluded) {
      shouldInclude = true;
    } else if (ignoredKeys.has(key)) {
      shouldInclude = false;
    }

    if (shouldInclude) {
      filtered[key] = payload[key];
    }
  }

  return filtered;
}
