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

export type HistoryMetadata<T> = Partial<Omit<T, keyof BaseHistoryLog | 'id' | 'created_at'>>;

export interface HistoryCapturedData {
  action: HistoryActionType;
  entityKey: string;
  entityId: string | number | null;
  contextEntityKey?: string;
  contextEntityId?: string | number | null;
  user_id: string | number | null;
  content: HistoryContent;
  [key: string]: any;
}

export type HistoryMapper<T> = (data: HistoryCapturedData) => Partial<T>;

export interface HistoryModuleBaseOptions<T> {
  userEntity?: any;
  userRequestKey?: string;
  userIdField?: string;
  ignoredKeys?: string[];
  softDeleteField?: string;
  historyLogEntity?: { new(): T };
  metadataProvider?: (req: any) => HistoryMetadata<T>;
}

export type HistoryModuleOptions<T = any, P extends boolean = true> = HistoryModuleBaseOptions<T> & {
  patchGlobal?: P;
} & (
    P extends true
    ? (T extends BaseHistoryLog ? { entityMapper?: HistoryMapper<T> } : { entityMapper: HistoryMapper<T> })
    : { entityMapper?: HistoryMapper<T> }
  );

export interface HistoryContextData<T = HistoryLog> {
  contextEntityKey: string;
  contextEntityId: string | number | null;
  user_id?: string | number;
  action?: HistoryActionType;
  requestId?: string;
  clientIp?: string;
  metadata?: HistoryMetadata<T>;
}

export interface HistoryContextOptions {
  entityKey?: string;
  idKey?: string;
  location?: 'params' | 'body' | 'query';
}

export interface HistoryTrackerOptions {
  entityKey: string;
}

export interface HistoryContent {
  old?: any;
  new?: any;
  [key: string]: any;
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
}

/**
 * Result shape returned by HistoryHelper.findAll().
 *
 * T is the history log entity type: the default HistoryLog (table `history_logs`), or your
 * custom entity when you pass historyLogEntity (and optionally entityMapper) in
 * HistoryModule.forRoot(). So when using a custom log table, T is your entity and
 * items are instances of that entity.
 */
export interface HistoryFindAllResult<T = HistoryLog> {
  /** Rows from your history log table (default or custom entity). */
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
