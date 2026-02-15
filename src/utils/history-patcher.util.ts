import { EntityManager, EntityTarget, ObjectLiteral, UpdateResult, DeleteResult, InsertResult } from 'typeorm';
import { HistoryCriteriaCarrier } from './history-criteria-carrier.util';

export class HistoryPatcher {
  constructor(private readonly carrier: HistoryCriteriaCarrier) { }

  patch(shouldTrack: (target: EntityTarget<any>) => boolean) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalUpdate = EntityManager.prototype.update;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalDelete = EntityManager.prototype.delete;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalInsert = EntityManager.prototype.insert;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalUpsert = EntityManager.prototype.upsert;

    const carrier = this.carrier;

    EntityManager.prototype.update = async function <Entity extends ObjectLiteral>(
      this: EntityManager,
      target: EntityTarget<Entity>,
      criteria: any,
      partialEntity: any,
    ): Promise<UpdateResult> {
      if (shouldTrack(target)) {
        carrier.attach(this, target, criteria);
      }
      try {
        return (await originalUpdate.call(this, target, criteria, partialEntity)) as UpdateResult;
      } finally {
        if (shouldTrack(target)) {
          carrier.clear(this.queryRunner, target);
        }
      }
    };

    EntityManager.prototype.delete = async function <Entity extends ObjectLiteral>(
      this: EntityManager,
      target: EntityTarget<Entity>,
      criteria: any,
    ): Promise<DeleteResult> {
      if (shouldTrack(target)) {
        carrier.attach(this, target, criteria);
      }
      try {
        return (await originalDelete.call(this, target, criteria)) as DeleteResult;
      } finally {
        if (shouldTrack(target)) {
          carrier.clear(this.queryRunner, target);
        }
      }
    };

    EntityManager.prototype.insert = async function <Entity extends ObjectLiteral>(
      this: EntityManager,
      target: EntityTarget<Entity>,
      entity: any,
    ): Promise<InsertResult> {
      if (shouldTrack(target)) {
        carrier.attach(this, target, null);
      }
      try {
        return (await originalInsert.call(this, target, entity)) as InsertResult;
      } finally {
        if (shouldTrack(target)) {
          carrier.clear(this.queryRunner, target);
        }
      }
    };

    EntityManager.prototype.upsert = async function <Entity extends ObjectLiteral>(
      this: EntityManager,
      target: EntityTarget<Entity>,
      entityOrEntities: any,
      conflictPathsOrOptions: any,
    ): Promise<any> {
      if (shouldTrack(target)) {
        carrier.attach(this, target, null);
      }
      try {
        return (await originalUpsert.call(
          this,
          target,
          entityOrEntities,
          conflictPathsOrOptions,
        ));
      } finally {
        if (shouldTrack(target)) {
          carrier.clear(this.queryRunner, target);
        }
      }
    };
  }
}
