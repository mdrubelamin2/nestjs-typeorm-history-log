import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Between, DataSource, EntityManager, EntityTarget, LessThanOrEqual, MoreThanOrEqual, ObjectLiteral, FindOptionsWhere } from 'typeorm';
import { BaseHistoryLog } from '../entities/base-history-log.entity';
import { HistoryLog } from '../entities/history-log.entity';
import { HistoryActionType } from '../enums/history.enum';
import { HISTORY_IGNORE_KEY, HISTORY_OPTIONS } from '../history.constants';
import {
  HistoryContent,
  HistoryContextData,
  HistoryFindAllOptions,
  HistoryFindAllResult,
  HistoryMetadata,
  HistoryModuleOptions,
  HistoryCapturedData,
} from '../interfaces/history.interface';
import { generateDiff } from '../utils/diff.util';
import { filterHistoryPayload } from '../utils/filter-payload.util';

@Injectable()
export class HistoryHelper<T = HistoryLog> {
  private readonly logger = new Logger(HistoryHelper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    @Inject(HISTORY_OPTIONS)
    private readonly options: HistoryModuleOptions<T>,
  ) { }

  async saveLog(params: {
    logData: {
      entityKey: string;
      action: HistoryActionType;
      oldState: ObjectLiteral;
      payload: ObjectLiteral;
      entityTarget: EntityTarget<any>;
    };
    manager: EntityManager;
    context?: Partial<HistoryContextData<T>>;
    metadata?: any;
  }) {
    const { logData, manager } = params;
    const { action, entityKey, oldState, payload, entityTarget } = logData;

    const entityName = this.getEntityName(entityTarget);
    const context = this.resolveContext(manager, entityName, params.context);
    const metadata = { ...context?.metadata, ...params.metadata } as HistoryMetadata<T>;

    if (!context || context.user_id === undefined || context.user_id === null) {
      throw new Error(
        `[HistoryModule] Strict Auditing Violation: Cannot log change for "${entityKey}". ` +
        `No user_id found in request context (CLS) or manual override. ` +
        `Ensure @HistoryContext is used or metadata is provided manually.`
      );
    }

    const data: ObjectLiteral = { ...oldState, ...payload };
    const entityId = this.toNormalizedId(this.dataSource.getRepository(entityTarget).getId(data));

    if (!entityId) {
      this.logger.error(
        `CRITICAL: Cannot log history for ${entityKey}. Missing primary key in data.`,
        { data }
      );
      return;
    }

    const ignoredSet = new Set(this.options.ignoredKeys ?? []);
    const filteredPayload = filterHistoryPayload(
      entityTarget as object,
      payload,
      ignoredSet
    );
    const filteredOldState = filterHistoryPayload(
      entityTarget as object,
      oldState,
      ignoredSet
    );

    let content: HistoryContent = {};
    if (action === HistoryActionType.CREATE) {
      content = filteredPayload;
    } else if (action === HistoryActionType.UPDATE) {
      content = generateDiff(filteredOldState, filteredPayload);
    } else if (action === HistoryActionType.DELETE) {
      content = filteredOldState;
    }

    // Skip if no changes detected in UPDATE
    if (action === HistoryActionType.UPDATE && Object.keys(content).length === 0) {
      return;
    }

    const historyLogEntity = this.options.historyLogEntity;
    if (!historyLogEntity) {
      throw new Error('[HistoryModule] historyLogEntity is required in options.');
    }
    const historyLogRepo = params.manager.getRepository(historyLogEntity);

    const capturedData: HistoryCapturedData = {
      ...metadata,
      action: params.logData.action,
      entityKey: params.logData.entityKey,
      entityId,
      contextEntityKey: context.contextEntityKey,
      contextEntityId: context.contextEntityId,
      user_id: context.user_id,
      content,
    };

    let log: any;
    if (this.options.entityMapper) {
      log = historyLogRepo.create(this.options.entityMapper(capturedData) as any);
    } else {
      log = historyLogRepo.create(capturedData as any);
    }

    await params.manager.save(historyLogEntity, log as any);
  }

  /**
   * Universal method to query history logs with advanced filtering and pagination.
   * Supports both native TypeORM options and semantic audit filters (fromDate, Action, etc.)
   */
  async findAll(options: HistoryFindAllOptions<T> = {}): Promise<HistoryFindAllResult<T>> {
    const historyLogEntityForRepo = this.options.historyLogEntity;
    if (!historyLogEntityForRepo) {
      throw new Error('[HistoryModule] historyLogEntity is required in options.');
    }
    const repository = this.dataSource.getRepository(historyLogEntityForRepo);
    const {
      fromDate, toDate,
      entityKey, entityId,
      contextEntityKey, contextEntityId,
      userId, action,
      page, limit,
      ...standardOptions
    } = options;

    // 1. Build semantic filters using BaseHistoryLog as a safe type bridge
    const semanticFilters: FindOptionsWhere<BaseHistoryLog> = {};

    if (fromDate && toDate) {
      semanticFilters.created_at = Between(fromDate, toDate);
    } else if (fromDate) {
      semanticFilters.created_at = MoreThanOrEqual(fromDate);
    } else if (toDate) {
      semanticFilters.created_at = LessThanOrEqual(toDate);
    }

    if (entityKey) semanticFilters.entityKey = entityKey;
    if (entityId) semanticFilters.entityId = entityId;
    if (contextEntityKey) semanticFilters.contextEntityKey = contextEntityKey;
    if (contextEntityId) semanticFilters.contextEntityId = contextEntityId;
    if (userId) semanticFilters.user_id = userId;
    if (action) semanticFilters.action = action;

    // 2. Merge semantic filters with user-provided where clause
    let where: FindOptionsWhere<T> | FindOptionsWhere<T>[];

    if (Array.isArray(standardOptions.where)) {
      where = standardOptions.where.map(w => ({
        ...w,
        ...(semanticFilters as FindOptionsWhere<T>),
      }));
    } else {
      where = {
        ...(standardOptions.where as FindOptionsWhere<T>),
        ...(semanticFilters as FindOptionsWhere<T>),
      };
    }

    // 3. Pagination Logic
    const take = limit || standardOptions.take || 10;
    const skip =
      page !== undefined
        ? (page - 1) * take
        : standardOptions.skip !== undefined
          ? standardOptions.skip
          : 0;

    const [items, total] = await repository.findAndCount({
      ...standardOptions,
      where,
      take,
      skip,
      order: (standardOptions.order || { created_at: 'DESC' }) as any,
    } as any);

    const pageNum = page !== undefined ? page : Math.floor(skip / take) + 1;
    return {
      items: items as T[],
      meta: {
        total,
        page: pageNum,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  private toNormalizedId(id: any): string | number {
    if (typeof id === 'number' || typeof id === 'string') return id;
    return String(id);
  }

  addMetadata(data: HistoryMetadata<T>) {
    if (!this.cls.isActive()) return;
    const context = this.cls.get<HistoryContextData<T>>('historyContext') || ({} as any);
    context.metadata = { ...(context.metadata || {}), ...data };
    this.cls.set('historyContext', context);
  }

  async ignore<R>(callback: () => Promise<R>): Promise<R> {
    return this.cls.runWith({ [HISTORY_IGNORE_KEY]: true } as Record<string, boolean>, callback);
  }

  private getEntityName(target: any): string {
    if (typeof target === 'function') return (target as { name: string }).name;
    if (typeof target === 'string') return target;
    if (typeof target === 'object' && target && 'name' in target) {
      const obj = target as { name: string };
      return obj.name;
    }
    return 'Unknown';
  }

  private resolveContext(
    manager: EntityManager,
    entityName: string,
    manualContext?: Partial<HistoryContextData<T>>,
  ): Partial<HistoryContextData<T>> {
    const clsContext = this.cls.isActive() ? this.cls.get<any>('historyContext') : null;

    const qrData = manager.queryRunner?.data as Record<string, any>;
    const sealedContext = qrData?.historyContexts instanceof Map
      ? qrData.historyContexts.get(entityName)
      : null;

    // Merge priority: Manual > Sealed (Transactional Snapshot) > Request (CLS)
    // Note: Use spread in this order to ensure most specific data wins, 
    // while empty keys in lean snapshots don't overwrite valid global data.
    return { ...clsContext, ...sealedContext, ...manualContext };
  }
}
