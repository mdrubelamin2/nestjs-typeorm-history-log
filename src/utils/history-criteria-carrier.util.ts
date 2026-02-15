import { ClsService } from 'nestjs-cls';
import { EntityManager, EntityMetadata, EntityTarget, FindOptionsWhere, ObjectLiteral, QueryRunner } from 'typeorm';
import { HistoryActionType } from '../enums/history.enum';
import { HistoryContextData } from '../interfaces/history.interface';

export interface HistoryPendingLog {
  newItem: ObjectLiteral | null;
  oldItem: ObjectLiteral | null;
  action: HistoryActionType;
  entityTarget: EntityTarget<any>;
  manager: EntityManager;
}

export interface SealedContext {
  criteria: any;
  user_id?: string | number;
  contextEntityKey?: string;
  contextEntityId?: string | number | null;
  metadata?: any;
}

export class HistoryCriteriaCarrier {
  constructor(private readonly cls: ClsService) { }

  private getContextsMap(queryRunner: QueryRunner | undefined): Map<string, SealedContext> | undefined {
    if (!queryRunner) return undefined;
    if (!queryRunner.data) queryRunner.data = {};
    const data = queryRunner.data as Record<string, any>;
    if (!data.historyContexts) {
      data.historyContexts = new Map<string, SealedContext>();
    }
    return data.historyContexts;
  }

  attach(manager: EntityManager, target: any, criteria: any) {
    const entityName = this.getEntityName(target);

    // Snapshot current global context from CLS (Lean Snapshot)
    const clsContext = this.cls.isActive() ? this.cls.get<HistoryContextData>('historyContext') : null;
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
      this.cls.set(`history_criteria_${entityName}`, criteria);
    }
  }

  clear(queryRunner: QueryRunner | undefined, target: any) {
    const entityName = this.getEntityName(target);

    const contexts = this.getContextsMap(queryRunner);
    if (contexts) {
      contexts.delete(entityName);
    }

    if (this.cls.isActive()) {
      this.cls.set(`history_criteria_${entityName}`, null);
    }
  }

  resolve(data: any, metadata: EntityMetadata, queryRunner?: QueryRunner): SealedContext | null {
    const contexts = this.getContextsMap(queryRunner);
    const sealed = contexts?.get(metadata.name);

    // If we have a sealed context but it lacks criteria (e.g. from an insert patch)
    // we use the provided data (the newly inserted ID) to build it.
    if (sealed) {
      if (sealed.criteria === null || sealed.criteria === undefined) {
        return { ...sealed, criteria: this.buildCriteriaFromData(data, metadata) };
      }
      return sealed;
    }

    // Priority 2: CLS Fallback (Non-transactional or manual set)
    const clsKey = `history_criteria_${metadata.name}`;
    const clsCriteria = this.cls.isActive() ? this.cls.get(clsKey) : null;

    const rawCriteria = clsCriteria || data;
    if (!rawCriteria) return null;

    return { criteria: this.buildCriteriaFromData(rawCriteria, metadata) };
  }

  private buildCriteriaFromData(data: any, metadata: EntityMetadata): any {
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
    return criteria;
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

  private getEntityName(target: any): string {
    if (typeof target === 'function') return (target as { name: string }).name;
    if (typeof target === 'string') return target;
    if (typeof target === 'object' && target && 'name' in target) {
      const obj = target as { name: string };
      return obj.name;
    }
    return 'Unknown';
  }
}
