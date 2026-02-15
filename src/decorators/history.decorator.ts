import { SetMetadata } from '@nestjs/common';
import {
  HISTORY_COLUMN_EXCLUDE_KEY,
  HISTORY_COLUMN_INCLUDE_KEY,
  HISTORY_CONTEXT_KEY,
  HISTORY_ENTITY_TRACKER_KEY,
} from '../history.constants';
import { HistoryContextOptions, HistoryTrackerOptions } from '../interfaces/history.interface';

/**
 * Sets the history context for a controller or method.
 */
export const HistoryContext = (options: HistoryContextOptions) => SetMetadata(HISTORY_CONTEXT_KEY, options);

/**
 * Enables history tracking on an entity.
 */
export const EntityHistoryTracker = (options: HistoryTrackerOptions) =>
  SetMetadata(HISTORY_ENTITY_TRACKER_KEY, options);

/**
 * Explicitly excludes a column from being tracked in history logs.
 * Use this for sensitive fields like passwords or large blobs.
 */
export const HistoryColumnExclude = () => (target: object, propertyKey: string | symbol) => {
  Reflect.defineMetadata(HISTORY_COLUMN_EXCLUDE_KEY, true, target, propertyKey);
};

/**
 * Re-includes a column that might be globally ignored.
 * Use this to specifically track fields like 'updated_at' if they are ignored globally.
 */
export const HistoryColumnInclude = () => (target: object, propertyKey: string | symbol) => {
  Reflect.defineMetadata(HISTORY_COLUMN_INCLUDE_KEY, true, target, propertyKey);
};
