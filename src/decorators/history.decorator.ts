import { SetMetadata } from '@nestjs/common';
import {
  HISTORY_COLUMN_EXCLUDE_KEY,
  HISTORY_COLUMN_INCLUDE_KEY,
  HISTORY_CONTEXT_KEY,
  HISTORY_ENTITY_TRACKER_KEY,
} from '../history.constants';
import { HistoryContextOptions, HistoryTrackerOptions } from '../interfaces/history.interface';

/**
 * Sets the history context for a controller or method so the library knows who and which parent entity
 * are involved. Attach to routes that mutate tracked entities; the interceptor reads user and optional
 * parent id from the request and stores them in CLS for the request.
 *
 * @param options - Where to read parent entity key/id from the request. See {@link HistoryContextOptions}.
 * @returns Method decorator (metadata only).
 */
export const HistoryContext = (options: HistoryContextOptions) => SetMetadata(HISTORY_CONTEXT_KEY, options);

/**
 * Marks an entity as tracked: insert/update/delete will be recorded in the history log.
 * Give each entity a stable {@link HistoryTrackerOptions.entityKey | entityKey} that identifies it in history.
 *
 * @param options - Must include `entityKey` (string identifier for this entity in history).
 * @returns Class decorator (metadata only).
 */
export const EntityHistoryTracker = (options: HistoryTrackerOptions) =>
  SetMetadata(HISTORY_ENTITY_TRACKER_KEY, options);

/**
 * Excludes this column from history payloads (sensitive or large data).
 * Use for passwords, tokens, or large blobs you do not want in the audit log.
 */
export const HistoryColumnExclude = () => (target: object, propertyKey: string | symbol) => {
  Reflect.defineMetadata(HISTORY_COLUMN_EXCLUDE_KEY, true, target, propertyKey);
};

/**
 * Re-includes this column even if it is in the global ignoredKeys list.
 * Use when you want to track a specific field (e.g. updated_at) that is otherwise ignored.
 */
export const HistoryColumnInclude = () => (target: object, propertyKey: string | symbol) => {
  Reflect.defineMetadata(HISTORY_COLUMN_INCLUDE_KEY, true, target, propertyKey);
};
