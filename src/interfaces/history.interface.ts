import { FindManyOptions, FindOptionsWhere } from 'typeorm';
import { BaseHistoryLog } from '../entities/base-history-log.entity';
import { HistoryLog } from '../entities/history-log.entity';
import { HistoryActionType } from '../enums/history.enum';

/**
 * Minimal interface to satisfy duck-typing for history logs.
 */
export interface HistoryLogLike {
  id?: number | string;
  contextEntityKey?: string;
  contextEntityId?: string | number | null;
  entityKey?: string;
  entityId?: string | number | null;
  action?: HistoryActionType;
  content?: HistoryContent;
  user_id?: string | number | null;
  created_at?: Date;
}

/** Extra columns (beyond BaseHistoryLog) you can set on a history row (e.g. ip, user_agent). */
export type HistoryMetadata<T> = Partial<Omit<T, keyof BaseHistoryLog | 'id' | 'created_at'>>;

/** Internal shape passed to entityMapper; contains action, entityKey, entityId, context, user_id, content. */
export interface HistoryCapturedData {
  action: HistoryActionType;
  entityKey: string;
  entityId: string | number | null;
  contextEntityKey?: string;
  contextEntityId?: string | number | null;
  user_id: string | number | null;
  content: HistoryContent;
  [key: string]: unknown;
}

/** Tier 3: maps {@link HistoryCapturedData} to your custom history entity. */
export type HistoryEntityMapper<T> = (data: HistoryCapturedData) => Partial<T>;

/** Base options for {@link HistoryModule.forRoot}: user resolution, ignored keys, entity, metadataProvider. */
export interface HistoryModuleBaseOptions<T> {
  userEntity?: object;
  userRequestKey?: string;
  userIdField?: string;
  ignoredKeys?: string[];
  softDeleteField?: string;
  historyLogEntity?: { new(): T };
  metadataProvider?: (req: unknown) => HistoryMetadata<T>;
}

/** Full options for {@link HistoryModule.forRoot}; includes patchGlobal and optional entityMapper for Tier 3. */
export type HistoryModuleOptions<T = HistoryLog, P extends boolean = true> = HistoryModuleBaseOptions<T> & {
  patchGlobal?: P;
} & (
    P extends true
    ? (T extends BaseHistoryLog ? { entityMapper?: HistoryEntityMapper<T> } : { entityMapper: HistoryEntityMapper<T> })
    : { entityMapper?: HistoryEntityMapper<T> }
  );

/** Resolved context for a history row: parent key/id, user_id, and optional metadata. */
export interface HistoryContextData<T = HistoryLog> {
  contextEntityKey: string;
  contextEntityId: string | number | null;
  user_id?: string | number;
  action?: HistoryActionType;
  requestId?: string;
  clientIp?: string;
  metadata?: HistoryMetadata<T>;
}

/** Options for {@link HistoryContext}: where to read parent entity key/id from the request (params, body, query). */
export interface HistoryContextOptions {
  entityKey?: string;
  idKey?: string;
  location?: 'params' | 'body' | 'query';
}

/** Options for {@link EntityHistoryTracker}: required entityKey identifying this entity in history. */
export interface HistoryTrackerOptions {
  entityKey: string;
}

/** Content stored in history: for UPDATE a diff (path → { old, new }), for CREATE/DELETE the full filtered row. */
export interface HistoryContent {
  old?: unknown;
  new?: unknown;
  [key: string]: unknown;
}

/** Side-by-side view of a single change, used by HistoryMapper and Unified Audit View. */
export interface UnifiedHistoryContent<T = unknown> {
  old: Partial<T> | null;
  new: Partial<T> | null;
}

export interface HistoryFindAllOptions<T = HistoryLog>
  extends Omit<FindManyOptions<T>, 'where'> {
  /**
   * Filter logs created after this date (inclusive)
   */
  fromDate?: Date;
  /**
   * Filter logs created before this date (inclusive)
   */
  toDate?: Date;
  /**
   * Filter by entity key (Top-level alias for where)
   */
  entityKey?: string;
  /**
   * Filter by entity ID (Top-level alias for where)
   */
  entityId?: string | number;
  /**
   * Filter by context entity key (Top-level alias for where)
   */
  contextEntityKey?: string;
  /**
   * Filter by context entity ID (Top-level alias for where)
   */
  contextEntityId?: string | number;
  /**
   * Filter by user ID (Top-level alias for where)
   */
  userId?: string | number;
  /**
   * Filter by action (Top-level alias for where)
   */
  action?: HistoryActionType;
  /**
   * Page number for pagination (Optional alias for offset)
   */
  page?: number;
  /**
   * Limit number of results (Optional alias for take)
   */
  limit?: number;
  /**
   * Standard TypeORM where conditions.
   */
  where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
  /**
   * Whether to unflatten dot-notated keys and return a unified {old, new} structure.
   * Default is true.
   */
  unflatten?: boolean;
}

/**
 * Result shape returned by HistoryHelper.findAll().
 *
 * T is the history log entity type.
 *
 * WARNING: If `unflatten` is true (default), the `content` property of each item
 * is transformed into a {@link UnifiedHistoryContent} object ({ old, new }),
 * which may differ from the raw `HistoryContent` type defined on your entity `T`.
 */
export interface HistoryFindAllResult<T = HistoryLog> {
  /** Rows from your history log table. Content is unified by default. */
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
