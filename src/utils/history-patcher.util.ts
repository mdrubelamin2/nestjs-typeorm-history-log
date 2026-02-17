import { EntityManager, EntityTarget, ObjectLiteral, UpdateResult, DeleteResult, InsertResult } from 'typeorm';
import { HistoryCriteriaCarrier } from './history-criteria-carrier.util';

/**
 * Monkey-patches TypeORM EntityManager methods to capture operation criteria.
 *
 * Why this is necessary:
 * TypeORM subscribers for `afterUpdate` and `afterRemove` do not always receive the full
 * entity state, especially for bulk operations or QueryBuilder usage. They often only
 * receive the partial changeset.
 *
 * To generate a complete history log (before/after), we need to fetch the original state
 * of the entity before the modification. This patch captures the `criteria` (WHERE clause)
 * from `update`, `delete`, `insert`, and `upsert` calls and attaches it to the current
 * QueryRunner context.
 *
 * Safety Mechanism:
 * We wrap the original method call in a `try/finally` block.
 * - `try`: Execute the original TypeORM method.
 * - `finally`: Guarantee that the captured context is cleared from the QueryRunner,
 *   preventing context pollution across different operations in the same transaction
 *   or connection pool.
 *
 * @warning DO NOT REFACTOR this class without understanding the `HistoryCriteriaCarrier`
 * lifecycle. Removing the `finally` block or the `clear` call will cause subtle
 * bugs where history context leaks between requests.
 */
export class HistoryPatcher {
  constructor(private readonly carrier: HistoryCriteriaCarrier) { }

  /**
   * Applies patches to EntityManager methods.
   *
   * @param shouldTrack - predicate to determine if an entity is tracked by history.
   */
  patch(shouldTrack: (target: EntityTarget<ObjectLiteral>) => boolean) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalUpdate = EntityManager.prototype.update;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalDelete = EntityManager.prototype.delete;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalInsert = EntityManager.prototype.insert;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalUpsert = EntityManager.prototype.upsert;

    const carrier = this.carrier;

    // TypeORM prototype patch; criteria/entity types vary by driver.
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
    ): Promise<InsertResult> {
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
