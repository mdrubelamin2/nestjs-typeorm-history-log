import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  DataSource,
  EntityManager,
  EntityMetadata,
  EntitySubscriberInterface,
  EntityTarget,
  EventSubscriber,
  InsertEvent,
  ObjectLiteral,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { BaseHistoryLog } from '../entities/base-history-log.entity';
import { HistoryLog } from '../entities/history-log.entity';
import { HistoryActionType } from '../enums/history.enum';
import {
  HISTORY_ENTITY_TRACKER_KEY,
  HISTORY_IGNORE_KEY,
  HISTORY_OPTIONS,
} from '../history.constants';
import { HistoryModuleOptions, HistoryTrackerOptions } from '../interfaces/history.interface';
import { HistoryHelper } from './history.helper';
import { HistoryCriteriaCarrier, HistoryPendingLog } from '../utils/history-criteria-carrier.util';
import { HistoryPatcher } from '../utils/history-patcher.util';

@EventSubscriber()
@Injectable()
export class HistorySubscriber<T = HistoryLog> implements EntitySubscriberInterface, OnModuleInit {
  private readonly logger = new Logger(HistorySubscriber.name);
  private readonly carrier: HistoryCriteriaCarrier;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    private readonly historyHelper: HistoryHelper<T>,
    @Inject(HISTORY_OPTIONS)
    private readonly options: HistoryModuleOptions<T>,
  ) {
    this.carrier = new HistoryCriteriaCarrier(this.cls);
  }

  onModuleInit() {
    this.dataSource.subscribers.push(this);

    if ((this.options as any).patchGlobal !== false) {
      new HistoryPatcher(this.carrier).patch((target) => this.shouldTrack(target));
      this.logger.log('HistorySubscriber: EntityManager patched for criteria capture');
    }
  }

  async afterInsert(event: InsertEvent<any>) {
    if (!this.shouldTrack(event.metadata.target)) return;

    const id = event.manager.getRepository(event.metadata.target).getId(event.entity);
    if (!id) return;

    const sealedContext = this.carrier.resolve(id, event.metadata, event.queryRunner);
    if (!sealedContext) return;

    let newItem = null;
    if (this.isDataComplete(event.entity, event.metadata)) {
      newItem = event.entity;
    } else {
      newItem = await event.manager.findOne(event.metadata.target, { where: sealedContext.criteria });
    }

    if (!newItem) return;

    await this.processLog(newItem, null, HistoryActionType.CREATE, event.metadata.target, event.manager);
  }

  async beforeUpdate(event: UpdateEvent<any>) {
    if (!this.shouldTrack(event.metadata.target)) return;

    const sealedContext = this.carrier.resolve(event.entity || event.databaseEntity, event.metadata, event.queryRunner);

    if (!sealedContext) {
      this.logger.warn(`HistorySubscriber: Cannot log history for ${event.metadata.name}. Update criteria is missing.`);
      return;
    }

    let oldStates = [];
    if (this.isDataComplete(event.databaseEntity, event.metadata)) {
      oldStates = [event.databaseEntity];
    } else {
      oldStates = await event.manager.find(event.metadata.target, { where: sealedContext.criteria });
    }

    for (const oldState of oldStates) {
      const newState: ObjectLiteral = { ...oldState, ...JSON.parse(JSON.stringify(event.entity)) };

      const softDeleteField = this.options.softDeleteField || 'is_deleted';
      const isSoftDelete = newState[softDeleteField] === true && oldState[softDeleteField] === false;

      const action = isSoftDelete ? HistoryActionType.DELETE : HistoryActionType.UPDATE;

      this.carrier.bufferLog(event.queryRunner, {
        newItem: newState,
        oldItem: oldState,
        action,
        entityTarget: event.metadata.target,
        manager: event.manager
      });
    }
  }

  async afterUpdate(event: UpdateEvent<any>) {
    await this.carrier.flushLogs(event.queryRunner, (pending: HistoryPendingLog) =>
      this.processLog(pending.newItem, pending.oldItem, pending.action, pending.entityTarget, pending.manager),
    );
  }

  async beforeRemove(event: RemoveEvent<any>) {
    if (!this.shouldTrack(event.metadata.target)) return;

    const sealedContext = this.carrier.resolve(event.entity || event.databaseEntity || event.entityId, event.metadata, event.queryRunner);
    if (!sealedContext) return;

    let items = [];
    if (this.isDataComplete(event.databaseEntity, event.metadata)) {
      items = [event.databaseEntity];
    } else {
      items = await event.manager.find(event.metadata.target, { where: sealedContext.criteria });
    }

    for (const item of items) {
      this.carrier.bufferLog(event.queryRunner, {
        newItem: null,
        oldItem: item,
        action: HistoryActionType.DELETE,
        entityTarget: event.metadata.target,
        manager: event.manager
      });
    }
  }

  async afterRemove(event: RemoveEvent<any>) {
    await this.carrier.flushLogs(event.queryRunner, (pending: HistoryPendingLog) =>
      this.processLog(pending.newItem, pending.oldItem, pending.action, pending.entityTarget, pending.manager),
    );
  }

  private async processLog(
    newItem: ObjectLiteral | null,
    oldItem: ObjectLiteral | null,
    action: HistoryActionType,
    entityTarget: EntityTarget<any>,
    manager: EntityManager
  ) {
    if (this.cls.isActive() && this.cls.get(HISTORY_IGNORE_KEY)) return;

    const meta = Reflect.getMetadata(HISTORY_ENTITY_TRACKER_KEY, entityTarget) as HistoryTrackerOptions;
    if (!meta) return;

    await this.historyHelper.saveLog({
      logData: {
        entityKey: meta.entityKey,
        action,
        oldState: oldItem || {},
        payload: newItem || {},
        entityTarget,
      },
      manager
    });
  }

  private shouldTrack(target: EntityTarget<unknown>): boolean {
    if (typeof target !== 'function') return false;
    return !!Reflect.getMetadata(HISTORY_ENTITY_TRACKER_KEY, target);
  }

  private isDataComplete(data: any, metadata: EntityMetadata): boolean {
    if (!data || typeof data !== 'object') return false;

    // Check Primary Keys
    const pkProperties = metadata.primaryColumns.map((col) => col.propertyName);
    for (const pk of pkProperties) {
      if (data[pk] === undefined || data[pk] === null) return false;
    }

    // Check Tracked Columns
    const trackedColumns = metadata.columns.map((col) => col.propertyName);
    for (const col of trackedColumns) {
      if (data[col] === undefined) return false;
    }

    return true;
  }
}
