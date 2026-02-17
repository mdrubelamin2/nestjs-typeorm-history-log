import { ClsService } from 'nestjs-cls';
import { EntityManager, EntityMetadata, EntityTarget, FindOptionsWhere, ObjectLiteral, QueryRunner } from 'typeorm';
import { HistoryActionType } from '../enums/history.enum';
import { HISTORY_CLS_CONTEXT_KEY, HISTORY_CRITERIA_CLS_PREFIX, HISTORY_QUERY_RUNNER_CONTEXTS_KEY } from '../history.constants';
import { HistoryContextData } from '../interfaces/history.interface';

export interface HistoryPendingLog {
  newItem: ObjectLiteral | null;
  oldItem: ObjectLiteral | null;
  action: HistoryActionType;
  entityTarget: EntityTarget<ObjectLiteral>;
  manager: EntityManager;
}

export interface SealedContext {
  criteria: FindOptionsWhere<ObjectLiteral> | null;
  user_id?: string | number;
  contextEntityKey?: string;
  contextEntityId?: string | number | null;
  metadata?: Record<string, unknown>;
}

export class HistoryCriteriaCarrier {
  constructor(private readonly cls: ClsService) { }

  private getContextsMap(queryRunner: QueryRunner | undefined): Map<string, SealedContext> | undefined {
    if (!queryRunner) return undefined;
    if (!queryRunner.data) queryRunner.data = {};
    const data = queryRunner.data as Record<string, unknown>;
    if (!data[HISTORY_QUERY_RUNNER_CONTEXTS_KEY]) {
      data[HISTORY_QUERY_RUNNER_CONTEXTS_KEY] = new Map<string, SealedContext>();
    }
    return data[HISTORY_QUERY_RUNNER_CONTEXTS_KEY] as Map<string, SealedContext>;
  }

  attach(manager: EntityManager, target: EntityTarget<ObjectLiteral>, criteria: FindOptionsWhere<ObjectLiteral> | null) {
    const entityName = this.getEntityName(target);

    // Snapshot current global context from CLS (Lean Snapshot)
    const clsContext = this.cls.isActive() ? this.cls.get<HistoryContextData>(HISTORY_CLS_CONTEXT_KEY) : null;
    const sealedContext: SealedContext = {
      criteria,
      ...(clsContext || {}),
    };

    // Transactional track (Namespaced Map)
    const contexts = this.getContextsMap(manager.queryRunner);
    if (contexts) {
      contexts.set(entityName, sealedContext);
    }

    // CLS track (Fallback for non-transactional/manual operations)
    if (this.cls.isActive()) {
      this.cls.set(`${HISTORY_CRITERIA_CLS_PREFIX}${entityName}`, criteria);
    }
  }

  clear(queryRunner: QueryRunner | undefined, target: EntityTarget<ObjectLiteral>) {
    const entityName = this.getEntityName(target);

    const contexts = this.getContextsMap(queryRunner);
    if (contexts) {
      contexts.delete(entityName);
    }

    if (this.cls.isActive()) {
      this.cls.set(`${HISTORY_CRITERIA_CLS_PREFIX}${entityName}`, null);
    }
  }

  /**
   * Resolves sealed context (criteria + CLS context). When fromAttach is true, criteria came from
   * the patcher (attach); when false, criteria were derived from entity/data. Callers can use
   * fromAttach to skip writing history when patchGlobal is false (only patched ops should log).
   */
  resolve(
    data: unknown,
    metadata: EntityMetadata,
    queryRunner?: QueryRunner
  ): { sealed: SealedContext; fromAttach: boolean } | null {
    const contexts = this.getContextsMap(queryRunner);
    const sealed = contexts?.get(metadata.name);

    // If we have a sealed context from the patcher (attach)
    if (sealed) {
      if (sealed.criteria === null || sealed.criteria === undefined) {
        const criteria = this.buildCriteriaFromData(data, metadata);
        return { sealed: { ...sealed, criteria }, fromAttach: true };
      }
      return { sealed, fromAttach: true };
    }

    // Fallback: derive criteria from CLS or entity data (not from patcher)
    const clsKey = `${HISTORY_CRITERIA_CLS_PREFIX}${metadata.name}`;
    const clsCriteria = this.cls.isActive() ? this.cls.get(clsKey) : null;
    const rawCriteria = clsCriteria || data;
    if (!rawCriteria) return null;

    const criteria = this.buildCriteriaFromData(rawCriteria, metadata);
    return criteria ? { sealed: { criteria }, fromAttach: false } : null;
  }

  private buildCriteriaFromData(data: unknown, metadata: EntityMetadata): FindOptionsWhere<ObjectLiteral> | null {
    if (!data) return null;

    // Convert raw criteria to a basic criteria object
    let criteria = data;
    if (typeof data !== 'object') {
      const pk = metadata.primaryColumns[0]?.propertyName || 'id';
      criteria = { [pk]: data };
    } else {
      const pks = metadata.primaryColumns.map((col) => col.propertyName);
      const result: ObjectLiteral = {};
      let hasPK = false;
      for (const pk of pks) {
        const val = (data as Record<string, unknown>)[pk];
        if (val !== undefined && val !== null) {
          result[pk] = val;
          hasPK = true;
        }
      }
      if (hasPK) criteria = result;
    }
    return criteria as FindOptionsWhere<ObjectLiteral>;
  }

  bufferLog(queryRunner: QueryRunner, options: HistoryPendingLog) {
    if (!queryRunner.data) queryRunner.data = {};
    const data = queryRunner.data as Record<string, unknown>;
    if (!Array.isArray(data.pendingLogs)) {
      data.pendingLogs = [];
    }
    (data.pendingLogs as HistoryPendingLog[]).push(options);
  }

  async flushLogs(queryRunner: QueryRunner, saveLogFn: (options: HistoryPendingLog) => Promise<void>) {
    const data = queryRunner.data as Record<string, unknown>;
    if (!data || !Array.isArray(data.pendingLogs)) return;

    const logs = data.pendingLogs as HistoryPendingLog[];
    for (const logOptions of logs) {
      await saveLogFn(logOptions);
    }
    delete data.pendingLogs;
  }

  private getEntityName(target: EntityTarget<unknown>): string {
    if (typeof target === 'function') return (target as { name: string }).name;
    if (typeof target === 'string') return target;
    if (typeof target === 'object' && target && 'name' in target) {
      const obj = target as { name: string };
      return obj.name;
    }
    return 'Unknown';
  }
}
