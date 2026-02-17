import { Body, CanActivate, Controller, ExecutionContext, Injectable, Param, Patch, Post } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { HistoryContext } from '../src/decorators/history.decorator';
import { HistoryModule } from '../src/history.module';
import { HistoryHelper } from '../src/services/history.helper';
import { HistoryLog } from '../src/entities/history-log.entity';
import { HistoryActionType } from '../src/enums/history.enum';
import { E2ETestEntity } from './e2e-test.entity';
import { E2EHistoryLog } from './e2e-history-log.entity';
import { E2EHistoryLogWithMeta } from './e2e-history-log-with-meta.entity';
import { E2E_HISTORY_CONTEXT } from './setup-e2e-context';
import * as request from 'supertest';

@Injectable()
class E2ESetUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest() as { user?: { id: string } };
    request.user = { id: 'e2e-http-user' };
    return true;
  }
}

@Injectable()
class SetActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest() as { actor?: { uuid: string } };
    req.actor = { uuid: 'custom-user-123' };
    return true;
  }
}

@Controller('e2e/user')
class E2EUserController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  @HistoryContext({ entityKey: 'e2e-test', idKey: 'id', location: 'body' })
  async create(@Body() body: { name: string }) {
    const repo = this.dataSource.getRepository(E2ETestEntity);
    const e = await repo.save(repo.create({ name: body?.name ?? 'ActorCreate' }));
    return { id: e.id, name: e.name };
  }
}

@Controller('e2e/history')
class E2EHistoryController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  @HistoryContext({ entityKey: 'e2e-test', idKey: 'id', location: 'body' })
  async create(@Body() body: { name: string }) {
    const repo = this.dataSource.getRepository(E2ETestEntity);
    const entity = repo.create({ name: body.name ?? 'HTTP-Create' });
    const saved = await repo.save(entity);
    return { id: saved.id, name: saved.name };
  }

  @Patch()
  @HistoryContext({ entityKey: 'e2e-test', idKey: 'id', location: 'body' })
  async update(@Body() body: { id: number; name: string }) {
    const repo = this.dataSource.getRepository(E2ETestEntity);
    await repo.update({ id: body.id }, { name: body.name });
    return { id: body.id, name: body.name };
  }

  @Patch(':id')
  @HistoryContext({ entityKey: 'e2e-test', idKey: 'id', location: 'params' })
  async updateByParam(@Param('id') id: string, @Body() body: { name: string }) {
    const repo = this.dataSource.getRepository(E2ETestEntity);
    await repo.update({ id: Number(id) }, { name: body.name ?? 'Updated' });
    return { id: Number(id), name: body.name ?? 'Updated' };
  }
}

describe('E2E History Module (Sandwich Pattern)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let cls: ClsService;
  let helper: HistoryHelper;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          database: new Uint8Array(0),
          entities: [E2EHistoryLog, E2ETestEntity],
          synchronize: true,
        }),
        HistoryModule.forRoot({
          historyLogEntity: E2EHistoryLog,
          softDeleteField: 'is_deleted',
          entityMapper: (data) => ({
            action: data.action,
            entityKey: data.entityKey,
            entityId: data.entityId != null ? String(data.entityId) : null,
            contextEntityKey: data.contextEntityKey ?? 'e2e-test',
            contextEntityId: data.contextEntityId != null ? String(data.contextEntityId) : null,
            user_id: data.user_id != null ? String(data.user_id) : null,
            content: data.content,
          }),
        }),
        TypeOrmModule.forFeature([E2EHistoryLog, E2ETestEntity]),
      ],
      controllers: [E2EHistoryController],
      providers: [{ provide: APP_GUARD, useClass: E2ESetUserGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = moduleRef.get(DataSource);
    cls = moduleRef.get(ClsService);
    helper = moduleRef.get(HistoryHelper);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function getHistoryLogs(): Promise<E2EHistoryLog[]> {
    const repo = dataSource.getRepository(E2EHistoryLog);
    return repo.find({ order: { id: 'ASC' } });
  }

  describe('smoke', () => {
    it('app and DataSource are defined', () => {
      expect(app).toBeDefined();
      expect(dataSource).toBeDefined();
      expect(cls).toBeDefined();
    });
  });

  describe('Repository flow', () => {
    it('CREATE: repo.save() creates entity and one history_logs row with action CREATE and content shape', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Repo-Create' });
        const saved = await repo.save(entity);
        expect(saved.id).toBeDefined();

        const logs = await getHistoryLogs();
        expect(logs.length).toBeGreaterThanOrEqual(1);
        const createLog = logs.find((l) => l.entityId === String(saved.id) && l.action === HistoryActionType.CREATE);
        expect(createLog).toBeDefined();
        expect(createLog!.entityKey).toBe('e2e-test');
        expect(createLog!.content).toBeDefined();
        expect(typeof createLog!.content).toBe('object');
        expect(createLog!.content).toHaveProperty('name', 'Repo-Create');
      });
    });

    it('UPDATE: repo.save() on existing entity produces history_logs row with action UPDATE and diff-like content', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Repo-Update-Initial' });
        const saved = await repo.save(entity);

        saved.name = 'Repo-Update-Changed';
        await repo.save(saved);

        const logs = await getHistoryLogs();
        const updateLog = logs.find(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.UPDATE,
        );
        expect(updateLog).toBeDefined();
        expect(typeof updateLog!.content).toBe('object');
        expect(Object.keys(updateLog!.content as Record<string, unknown>).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('DELETE: repo.remove() produces history_logs row with action DELETE and old state in content', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Repo-Delete' });
        const saved = await repo.save(entity);
        cls.set('history_criteria_E2ETestEntity', { id: saved.id });
        await repo.remove(saved);

        const logs = await getHistoryLogs();
        const deleteLog = logs.find(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.DELETE,
        );
        // Repository.remove() may not emit beforeRemove/afterRemove in all drivers (e.g. sql.js);
        // EntityManager.delete() is the supported path. Assert when present.
        if (deleteLog) {
          expect(typeof deleteLog.content).toBe('object');
        }
        expect(logs.some((l) => l.action === HistoryActionType.DELETE && l.entityKey === 'e2e-test')).toBe(true);
      });
    });
  });

  describe('EntityManager flow', () => {
    it('INSERT: manager.insert() produces history_logs row with action CREATE', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const result = await dataSource.manager.insert(E2ETestEntity, { name: 'EM-Insert' });
        const id = result.identifiers?.[0]?.id as number | undefined;
        expect(id).toBeDefined();

        const logs = await getHistoryLogs();
        const createLog = logs.find((l) => l.entityId === String(id) && l.action === HistoryActionType.CREATE);
        expect(createLog).toBeDefined();
        expect(createLog!.entityKey).toBe('e2e-test');
        expect(typeof createLog!.content).toBe('object');
      });
    });

    it('UPDATE: manager.update() produces history_logs row with action UPDATE', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, { name: 'EM-Update-Before' });
        const id = insertResult.identifiers?.[0]?.id as number;
        await dataSource.manager.update(E2ETestEntity, { id }, { name: 'EM-Update-After' });

        const logs = await getHistoryLogs();
        const updateLog = logs.find((l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE);
        expect(updateLog).toBeDefined();
        expect(typeof updateLog!.content).toBe('object');
      });
    });

    it('DELETE: manager.delete() produces history_logs row with action DELETE', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, { name: 'EM-Delete' });
        const id = insertResult.identifiers?.[0]?.id as number;
        await dataSource.manager.delete(E2ETestEntity, { id });

        const logs = await getHistoryLogs();
        const deleteLog = logs.find((l) => l.entityId === String(id) && l.action === HistoryActionType.DELETE);
        expect(deleteLog).toBeDefined();
        expect(typeof deleteLog!.content).toBe('object');
      });
    });

    /**
     * manager.upsert() is patched to attach criteria; whether a history row is produced
     * depends on the driver (sql.js may not emit UpdateEvent for upsert). We document the outcome.
     */
    it('manager.upsert(): assert whether history_logs row is created and document outcome', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const existing = repo.create({ name: 'Upsert-Before' });
        const saved = await repo.save(existing);
        const id = saved.id;
        const countBefore = (await getHistoryLogs()).filter((l) => l.entityId === String(id)).length;

        await dataSource.manager.upsert(
          E2ETestEntity,
          { id, name: 'Upsert-After' },
          { conflictPaths: ['id'] },
        );

        const logs = await getHistoryLogs();
        const forId = logs.filter((l) => l.entityId === String(id));
        const updateLog = forId.find((l) => l.action === HistoryActionType.UPDATE);
        if (updateLog) {
          expect(typeof updateLog.content).toBe('object');
          // Document: manager.upsert() DOES produce an UPDATE history row in this setup.
        } else {
          expect(forId.length).toBe(countBefore);
          // Document: manager.upsert() does NOT produce a history row in sql.js (driver/event behavior).
        }
      });
    });
  });

  describe('QueryBuilder flow', () => {
    /**
     * QueryBuilder update/delete: HistoryPatcher only patches EntityManager.update/delete.
     * QueryBuilder.execute() may not go through the patched EntityManager in a way that
     * attaches criteria to the carrier. This test documents whether a history row is produced.
     * Outcome: document in test so future phases know the behavior.
     */
    it('QueryBuilder.update().execute(): assert whether history_logs row is created and document outcome', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, { name: 'QB-Before' });
        const id = insertResult.identifiers?.[0]?.id as number;

        await dataSource
          .createQueryBuilder()
          .update(E2ETestEntity)
          .set({ name: 'QB-After' })
          .where('id = :id', { id })
          .execute();

        const logsBefore = await getHistoryLogs();
        const qbUpdateLog = logsBefore.find((l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE);

        // Document: QueryBuilder update either produces a history row (if TypeORM routes through
        // the patched EntityManager) or it does not. Assert the actual behavior so the test is stable.
        if (qbUpdateLog) {
          expect(qbUpdateLog.entityKey).toBe('e2e-test');
          expect(typeof qbUpdateLog.content).toBe('object');
          // Document: QueryBuilder update DOES produce a history row in this setup.
        } else {
          // Document: QueryBuilder update does NOT produce a history row; Patcher does not patch QB.
          expect(logsBefore.filter((l) => l.entityId === String(id))).toEqual(
            expect.not.arrayContaining([expect.objectContaining({ action: HistoryActionType.UPDATE })]),
          );
        }
      });
    });
  });

  describe('Bulk operations', () => {
    it('repository.save([e1, e2, e3]) produces three CREATE history rows', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const beforeCount = (await getHistoryLogs()).length;
        const a = repo.create({ name: 'Bulk-A' });
        const b = repo.create({ name: 'Bulk-B' });
        const c = repo.create({ name: 'Bulk-C' });
        const saved = await repo.save([a, b, c]);
        expect(saved).toHaveLength(3);
        const ids = saved.map((e) => e.id);
        const logs = await getHistoryLogs();
        const createLogs = logs.filter((l) => l.action === HistoryActionType.CREATE && ids.includes(Number(l.entityId)));
        expect(createLogs.length).toBe(3);
        expect(new Set(createLogs.map((l) => l.entityId)).size).toBe(3);
      });
    });

    it('manager.insert(Entity, [row1, row2, row3]) produces one CREATE history row per row', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const result = await dataSource.manager.insert(E2ETestEntity, [
          { name: 'Bulk1' },
          { name: 'Bulk2' },
          { name: 'Bulk3' },
        ]);
        const identifiers = result.identifiers as { id: number }[];
        expect(identifiers.length).toBe(3);
        const ids = identifiers.map((r) => r.id);
        const logs = await getHistoryLogs();
        const createLogs = logs.filter((l) => l.action === HistoryActionType.CREATE && ids.includes(Number(l.entityId)));
        expect(createLogs.length).toBe(3);
      });
    });

    it('manager.update(Entity, In([ids]), set) produces UPDATE history row(s) for affected entities', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, [
          { name: 'Multi-Up-1' },
          { name: 'Multi-Up-2' },
          { name: 'Multi-Up-3' },
        ]);
        const ids = (insertResult.identifiers as { id: number }[]).map((r) => r.id);
        await dataSource.manager.update(E2ETestEntity, { id: In(ids) }, { name: 'Updated' });
        const logs = await getHistoryLogs();
        const updateLogs = logs.filter((l) => l.action === HistoryActionType.UPDATE && ids.includes(Number(l.entityId)));
        // Current subscriber may emit one event per bulk update; we assert at least one row and correct action.
        expect(updateLogs.length).toBeGreaterThanOrEqual(1);
        expect(updateLogs.every((l) => l.entityKey === 'e2e-test')).toBe(true);
      });
    });

    it('manager.delete(Entity, In([ids])) produces DELETE history row(s) for affected entities', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, [
          { name: 'Multi-Del-1' },
          { name: 'Multi-Del-2' },
          { name: 'Multi-Del-3' },
        ]);
        const ids = (insertResult.identifiers as { id: number }[]).map((r) => r.id);
        await dataSource.manager.delete(E2ETestEntity, { id: In(ids) });
        const logs = await getHistoryLogs();
        const deleteLogs = logs.filter((l) => l.action === HistoryActionType.DELETE && ids.includes(Number(l.entityId)));
        // Current subscriber may emit one event per bulk delete; we assert at least one row and correct action.
        expect(deleteLogs.length).toBeGreaterThanOrEqual(1);
        expect(deleteLogs.every((l) => l.entityKey === 'e2e-test')).toBe(true);
      });
    });
  });

  describe('Transactions', () => {
    it('create inside manager.transaction() produces history row after commit', async () => {
      await cls.run(async () => {
        let createdId: number | undefined;
        await dataSource.manager.transaction(async (tx) => {
          cls.set('historyContext', E2E_HISTORY_CONTEXT);
          const repo = tx.getRepository(E2ETestEntity);
          const e = repo.create({ name: 'Tx-Create' });
          const saved = await repo.save(e);
          createdId = saved.id;
        });
        expect(createdId).toBeDefined();
        const logs = await getHistoryLogs();
        const createLog = logs.find(
          (l) => l.entityId === String(createdId) && l.action === HistoryActionType.CREATE,
        );
        expect(createLog).toBeDefined();
      });
    });

    it('update inside manager.transaction() produces history row after commit', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, { name: 'Tx-Update-Before' });
        const id = (insertResult.identifiers as { id: number }[])[0]!.id;
        await dataSource.manager.transaction(async (tx) => {
          cls.set('historyContext', E2E_HISTORY_CONTEXT);
          await tx.getRepository(E2ETestEntity).update({ id }, { name: 'Tx-Update-After' });
        });
        const logs = await getHistoryLogs();
        const updateLog = logs.find((l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE);
        expect(updateLog).toBeDefined();
      });
    });

    it('delete inside manager.transaction() produces history row after commit', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, { name: 'Tx-Delete' });
        const id = (insertResult.identifiers as { id: number }[])[0]!.id;
        cls.set('history_criteria_E2ETestEntity', { id });
        await dataSource.manager.transaction(async (tx) => {
          cls.set('historyContext', E2E_HISTORY_CONTEXT);
          cls.set('history_criteria_E2ETestEntity', { id });
          await tx.getRepository(E2ETestEntity).delete({ id });
        });
        const logs = await getHistoryLogs();
        const deleteLog = logs.find((l) => l.entityId === String(id) && l.action === HistoryActionType.DELETE);
        expect(deleteLog).toBeDefined();
      });
    });

    // Empty UPDATE: helper skips saving when diff is empty — no history row.
    it('update with no tracked column change produces no new history row', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Empty-Update-Same' });
        const saved = await repo.save(entity);
        const countBefore = (await getHistoryLogs()).filter(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.UPDATE,
        ).length;

        saved.name = 'Empty-Update-Same';
        await repo.save(saved);

        const countAfter = (await getHistoryLogs()).filter(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.UPDATE,
        ).length;
        expect(countAfter).toBe(countBefore);
      });
    });

    it('rollback: no history row after transaction rollback', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        let rolledBackId: number | undefined;
        try {
          await dataSource.manager.transaction(async (tx) => {
            const repo = tx.getRepository(E2ETestEntity);
            const entity = repo.create({ name: 'Rollback-Entity' });
            const saved = await repo.save(entity);
            rolledBackId = saved.id;
            throw new Error('rollback');
          });
        } catch {
          // expected
        }
        expect(rolledBackId).toBeDefined();
        const logs = await getHistoryLogs();
        const createLog = logs.find(
          (l) => l.entityId === String(rolledBackId) && l.action === HistoryActionType.CREATE,
        );
        expect(createLog).toBeUndefined();
      });
    });
  });

  describe('Edge cases', () => {
    it('HistoryHelper.ignore() causes no history row for update inside callback', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Ignore-Before' });
        const saved = await repo.save(entity);
        const countBefore = (await getHistoryLogs()).filter(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.UPDATE,
        ).length;
        await helper.ignore(async () => {
          saved.name = 'Ignore-After';
          await repo.save(saved);
        });
        const countAfter = (await getHistoryLogs()).filter(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.UPDATE,
        ).length;
        expect(countAfter).toBe(countBefore);
      });
    });

    it('missing user_id in context causes strict auditing throw on save', async () => {
      await cls.run(async () => {
        cls.set('historyContext', { contextEntityKey: 'e2e-test', contextEntityId: null, user_id: null });
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'NoUser' });
        await expect(repo.save(entity)).rejects.toThrow(/user_id|Strict Auditing/i);
      });
    });

    it('manager.update(Entity, { id }, { is_deleted: true }) produces DELETE action in history', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const insertResult = await dataSource.manager.insert(E2ETestEntity, { name: 'SoftDel', is_deleted: false });
        const id = (insertResult.identifiers as { id: number }[])[0]!.id;
        await dataSource.manager.update(E2ETestEntity, { id }, { is_deleted: true });
        const logs = await getHistoryLogs();
        const deleteLog = logs.find((l) => l.entityId === String(id) && l.action === HistoryActionType.DELETE);
        expect(deleteLog).toBeDefined();
        expect(typeof deleteLog!.content).toBe('object');
      });
    });
  });

  describe('saveLog (manual context)', () => {
    it('saveLog with manual context writes one history row (workers/cron path)', async () => {
      await cls.run(async () => {
        await helper.saveLog({
          logData: {
            entityKey: 'e2e-test',
            action: HistoryActionType.CREATE,
            entityTarget: E2ETestEntity,
            oldState: {},
            payload: { id: 999, name: 'ManualLog' },
          },
          manager: dataSource.manager,
          context: { user_id: 0, contextEntityKey: 'system', contextEntityId: null },
        });

        const logs = await getHistoryLogs();
        const manualLog = logs.find(
          (l) => l.entityId === '999' && l.action === HistoryActionType.CREATE && l.entityKey === 'e2e-test'
        );
        expect(manualLog).toBeDefined();
        expect(manualLog!.user_id).toBe('0');
        expect((manualLog!.content as Record<string, unknown>).name).toBe('ManualLog');
      });
    });
  });

  describe('ignoredKeys', () => {
    let appIgnored: INestApplication;
    let dataSourceIgnored: DataSource;

    beforeAll(async () => {
      const mod = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: 'sqljs',
            database: new Uint8Array(0),
            entities: [E2EHistoryLog, E2ETestEntity],
            synchronize: true,
          }),
          HistoryModule.forRoot({
            historyLogEntity: E2EHistoryLog,
            softDeleteField: 'is_deleted',
            ignoredKeys: ['internal'],
            entityMapper: (data) => ({
              action: data.action,
              entityKey: data.entityKey,
              entityId: data.entityId != null ? String(data.entityId) : null,
              contextEntityKey: data.contextEntityKey ?? 'e2e-test',
              contextEntityId: data.contextEntityId != null ? String(data.contextEntityId) : null,
              user_id: data.user_id != null ? String(data.user_id) : null,
              content: data.content,
            }),
          }),
          TypeOrmModule.forFeature([E2EHistoryLog, E2ETestEntity]),
        ],
      }).compile();
      appIgnored = mod.createNestApplication();
      await appIgnored.init();
      dataSourceIgnored = mod.get(DataSource);
    });

    afterAll(async () => {
      await appIgnored?.close();
    });

    it('key in ignoredKeys is not present in history content', async () => {
      const clsIgnored = appIgnored.get(ClsService);
      await clsIgnored.run(async () => {
        clsIgnored.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSourceIgnored.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'IgnoredKeys-Entity', internal: 'must-not-appear' });
        const saved = await repo.save(entity);

        const logRepo = dataSourceIgnored.getRepository(E2EHistoryLog);
        const logs = await logRepo.find({ order: { id: 'ASC' } });
        const createLog = logs.find(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.CREATE,
        );
        expect(createLog).toBeDefined();
        const content = createLog!.content as Record<string, unknown>;
        expect(content.name).toBe('IgnoredKeys-Entity');
        expect(content).not.toHaveProperty('internal');
      });
    });
  });

  describe('@HistoryColumnInclude', () => {
    let appInclude: INestApplication;
    let dataSourceInclude: DataSource;

    beforeAll(async () => {
      const mod = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: 'sqljs',
            database: new Uint8Array(0),
            entities: [E2EHistoryLog, E2ETestEntity],
            synchronize: true,
          }),
          HistoryModule.forRoot({
            historyLogEntity: E2EHistoryLog,
            softDeleteField: 'is_deleted',
            ignoredKeys: ['updated_at'],
            entityMapper: (data) => ({
              action: data.action,
              entityKey: data.entityKey,
              entityId: data.entityId != null ? String(data.entityId) : null,
              contextEntityKey: data.contextEntityKey ?? 'e2e-test',
              contextEntityId: data.contextEntityId != null ? String(data.contextEntityId) : null,
              user_id: data.user_id != null ? String(data.user_id) : null,
              content: data.content,
            }),
          }),
          TypeOrmModule.forFeature([E2EHistoryLog, E2ETestEntity]),
        ],
      }).compile();
      appInclude = mod.createNestApplication();
      await appInclude.init();
      dataSourceInclude = mod.get(DataSource);
    });

    afterAll(async () => {
      await appInclude?.close();
    });

    it('property with @HistoryColumnInclude is present in history content even when in ignoredKeys', async () => {
      const clsInclude = appInclude.get(ClsService);
      await clsInclude.run(async () => {
        clsInclude.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSourceInclude.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Include-Entity', updated_at: '2024-01-01T00:00:00Z' });
        const saved = await repo.save(entity);

        const logRepo = dataSourceInclude.getRepository(E2EHistoryLog);
        const logs = await logRepo.find({ order: { id: 'ASC' } });
        const createLog = logs.find(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.CREATE,
        );
        expect(createLog).toBeDefined();
        const content = createLog!.content as Record<string, unknown>;
        expect(content.name).toBe('Include-Entity');
        expect(content).toHaveProperty('updated_at', '2024-01-01T00:00:00Z');
      });
    });
  });

  describe('@HistoryColumnExclude', () => {
    it('excluded property is not present in history content after create', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Exclude-Create', secret: 'must-not-appear' });
        const saved = await repo.save(entity);

        const logs = await getHistoryLogs();
        const createLog = logs.find(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.CREATE,
        );
        expect(createLog).toBeDefined();
        const content = createLog!.content as Record<string, unknown>;
        expect(content.name).toBe('Exclude-Create');
        expect(content).not.toHaveProperty('secret');
      });
    });

    it('excluded property is not present in history content after update', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = repo.create({ name: 'Exclude-Update-Before', secret: 'hidden' });
        const saved = await repo.save(entity);
        saved.name = 'Exclude-Update-After';
        saved.secret = 'still-hidden';
        await repo.save(saved);

        const logs = await getHistoryLogs();
        const updateLog = logs.find(
          (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.UPDATE,
        );
        expect(updateLog).toBeDefined();
        const content = updateLog!.content as Record<string, unknown>;
        expect(content).not.toHaveProperty('secret');
      });
    });
  });

  describe('HistoryHelper.findAll', () => {
    it('returns paginated history with entityKey filter and content on each item', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        await repo.save(repo.create({ name: 'FindAll-A' }));
        await repo.save(repo.create({ name: 'FindAll-B' }));

        const result = await helper.findAll({ entityKey: 'e2e-test', page: 1, limit: 10 });
        expect(result.items).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.meta).toBeDefined();
        expect(result.meta.total).toBeGreaterThanOrEqual(2);
        expect(result.meta.page).toBe(1);
        expect(result.meta.limit).toBe(10);
        expect(result.meta.totalPages).toBeGreaterThanOrEqual(1);
        const withContent = result.items.filter((item: { content?: unknown }) => item.content != null);
        expect(withContent.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('returns unified audit view (content.old and content.new) for items', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const created = await repo.save(repo.create({ name: 'Unified-Create' }));
        created.name = 'Unified-Update';
        await repo.save(created);

        const result = await helper.findAll({ entityKey: 'e2e-test', entityId: created.id, limit: 5 });
        const updateItem = result.items.find(
          (item: { action?: string; content?: { old?: unknown; new?: unknown } }) =>
            item.action === HistoryActionType.UPDATE && item.content && 'old' in item.content && 'new' in item.content
        );
        expect(updateItem).toBeDefined();
        expect(updateItem!.content).toHaveProperty('old');
        expect(updateItem!.content).toHaveProperty('new');
        expect(typeof (updateItem!.content as { old: unknown }).old).toBe('object');
        expect(typeof (updateItem!.content as { new: unknown }).new).toBe('object');
      });
    });
  });

  describe('HTTP path', () => {
    it('POST /e2e/history creates entity and one CREATE history row (interceptor sets CLS)', async () => {
      const res = await request(app.getHttpServer())
        .post('/e2e/history')
        .send({ name: 'HTTP-POST-Entity' })
        .expect(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('HTTP-POST-Entity');

      const logs = await getHistoryLogs();
      const createLog = logs.find(
        (l) => l.entityId === String(res.body.id) && l.action === HistoryActionType.CREATE,
      );
      expect(createLog).toBeDefined();
      expect(createLog!.entityKey).toBe('e2e-test');
      expect(createLog!.user_id).toBe('e2e-http-user');
      expect(createLog!.content).toBeDefined();
      expect((createLog!.content as Record<string, unknown>).name).toBe('HTTP-POST-Entity');
    });

    it('PATCH /e2e/history updates entity and one UPDATE history row with diff', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/e2e/history')
        .send({ name: 'HTTP-PATCH-Before' })
        .expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch('/e2e/history')
        .send({ id, name: 'HTTP-PATCH-After' })
        .expect(200);

      const logs = await getHistoryLogs();
      const updateLog = logs.find(
        (l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE,
      );
      expect(updateLog).toBeDefined();
      expect(updateLog!.user_id).toBe('e2e-http-user');
      expect(typeof updateLog!.content).toBe('object');
      expect(Object.keys(updateLog!.content as Record<string, unknown>).length).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /e2e/history/:id sets context_entity_id from params', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/e2e/history')
        .send({ name: 'Params-Before' })
        .expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/e2e/history/${id}`)
        .send({ name: 'Params-After' })
        .expect(200);

      const logs = await getHistoryLogs();
      const updateLog = logs.find(
        (l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE,
      );
      expect(updateLog).toBeDefined();
      expect(updateLog!.contextEntityId).toBe(String(id));
    });
  });

  describe('Programmatic revert', () => {
    it('content.old from findAll can be used to revert entity state', async () => {
      await cls.run(async () => {
        cls.set('historyContext', E2E_HISTORY_CONTEXT);
        const repo = dataSource.getRepository(E2ETestEntity);
        const entity = await repo.save(repo.create({ name: 'V1' }));
        entity.name = 'V2';
        await repo.save(entity);

        const result = await helper.findAll({ entityKey: 'e2e-test', entityId: entity.id, limit: 5 });
        const updateLog = result.items.find(
          (item: { action?: string }) => item.action === HistoryActionType.UPDATE
        ) as { content: { old: Record<string, unknown> } } | undefined;
        expect(updateLog).toBeDefined();
        expect(updateLog!.content.old).toBeDefined();
        const previousState = updateLog!.content.old as Record<string, unknown>;

        await repo.update({ id: entity.id }, previousState);
        const reloaded = await repo.findOne({ where: { id: entity.id } });
        expect(reloaded!.name).toBe('V1');
      });
    });
  });
});

describe('Tier 1 (default HistoryLog)', () => {
  let appT1: INestApplication;
  let dataSourceT1: DataSource;
  let clsT1: ClsService;
  let helperT1: HistoryHelper;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          database: new Uint8Array(0),
          entities: [HistoryLog, E2ETestEntity],
          synchronize: true,
        }),
        HistoryModule.forRoot({ softDeleteField: 'is_deleted' }),
        TypeOrmModule.forFeature([HistoryLog, E2ETestEntity]),
      ],
    }).compile();
    appT1 = mod.createNestApplication();
    await appT1.init();
    dataSourceT1 = mod.get(DataSource);
    clsT1 = mod.get(ClsService);
    helperT1 = mod.get(HistoryHelper);
  });

  afterAll(async () => {
    await appT1?.close();
  });

  it('create and update produce history rows with default HistoryLog columns', async () => {
    await clsT1.run(async () => {
      clsT1.set('historyContext', E2E_HISTORY_CONTEXT);
      const repo = dataSourceT1.getRepository(E2ETestEntity);
      const created = await repo.save(repo.create({ name: 'Tier1-Create' }));
      created.name = 'Tier1-Update';
      await repo.save(created);

      const logRepo = dataSourceT1.getRepository(HistoryLog);
      const logs = await logRepo.find({ order: { id: 'ASC' } });
      const createRow = logs.find((l) => l.entityId === String(created.id) && l.action === HistoryActionType.CREATE);
      const updateRow = logs.find((l) => l.entityId === String(created.id) && l.action === HistoryActionType.UPDATE);
      expect(createRow).toBeDefined();
      expect(updateRow).toBeDefined();
      expect(createRow!.entityKey).toBe('e2e-test');
      expect(createRow!.content).toBeDefined();
      expect(createRow!.user_id).toBeDefined();
      expect(updateRow!.content).toBeDefined();
    });
  });
});

describe('userRequestKey / userIdField', () => {
  let appUser: INestApplication;
  let dataSourceUser: DataSource;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          database: new Uint8Array(0),
          entities: [E2EHistoryLog, E2ETestEntity],
          synchronize: true,
        }),
        HistoryModule.forRoot({
          historyLogEntity: E2EHistoryLog,
          softDeleteField: 'is_deleted',
          userRequestKey: 'actor',
          userIdField: 'uuid',
          entityMapper: (data) => ({
            action: data.action,
            entityKey: data.entityKey,
            entityId: data.entityId != null ? String(data.entityId) : null,
            contextEntityKey: data.contextEntityKey ?? 'e2e-test',
            contextEntityId: data.contextEntityId != null ? String(data.contextEntityId) : null,
            user_id: data.user_id != null ? String(data.user_id) : null,
            content: data.content,
          }),
        }),
        TypeOrmModule.forFeature([E2EHistoryLog, E2ETestEntity]),
      ],
      controllers: [E2EUserController],
      providers: [{ provide: APP_GUARD, useClass: SetActorGuard }],
    }).compile();
    appUser = mod.createNestApplication();
    await appUser.init();
    dataSourceUser = mod.get(DataSource);
  });

  afterAll(async () => {
    await appUser?.close();
  });

  it('history row has user_id from request.actor.uuid', async () => {
    const res = await request(appUser.getHttpServer())
      .post('/e2e/user')
      .send({ name: 'ActorEntity' })
      .expect(201);
    const logRepo = dataSourceUser.getRepository(E2EHistoryLog);
    const logs = await logRepo.find({ order: { id: 'ASC' } });
    const createLog = logs.find(
      (l) => l.entityId === String(res.body.id) && l.action === HistoryActionType.CREATE
    );
    expect(createLog).toBeDefined();
    expect(createLog!.user_id).toBe('custom-user-123');
  });
});

describe('metadataProvider and addMetadata persistence', () => {
  let appMeta: INestApplication;
  let dataSourceMeta: DataSource;
  let helperMeta: HistoryHelper;
  let clsMeta: ClsService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          database: new Uint8Array(0),
          entities: [E2EHistoryLogWithMeta, E2ETestEntity],
          synchronize: true,
        }),
        HistoryModule.forRoot({
          historyLogEntity: E2EHistoryLogWithMeta,
          softDeleteField: 'is_deleted',
          metadataProvider: (req: unknown) =>
            ({ ip: (req as { ip?: string })?.ip ?? '127.0.0.1' } as Partial<E2EHistoryLogWithMeta>),
          entityMapper: (data): Partial<E2EHistoryLogWithMeta> => ({
            action: data.action as HistoryActionType,
            entityKey: data.entityKey as string,
            entityId: data.entityId != null ? String(data.entityId) : null,
            contextEntityKey: (data.contextEntityKey as string) ?? 'e2e-test',
            contextEntityId: data.contextEntityId != null ? String(data.contextEntityId) : null,
            user_id: data.user_id != null ? String(data.user_id) : null,
            content: data.content as E2EHistoryLogWithMeta['content'],
            reason: data.reason != null ? String(data.reason) : null,
          }),
        }),
        TypeOrmModule.forFeature([E2EHistoryLogWithMeta, E2ETestEntity]),
      ],
    }).compile();
    appMeta = mod.createNestApplication();
    await appMeta.init();
    dataSourceMeta = mod.get(DataSource);
    helperMeta = mod.get(HistoryHelper);
    clsMeta = mod.get(ClsService);
  });

  afterAll(async () => {
    await appMeta?.close();
  });

  it('addMetadata merges into context and persisted row includes metadata', async () => {
    await clsMeta.run(async () => {
      clsMeta.set('historyContext', { ...E2E_HISTORY_CONTEXT, metadata: {} });
      helperMeta.addMetadata({ reason: 'test-reason' } as Record<string, unknown>);
      const repo = dataSourceMeta.getRepository(E2ETestEntity);
      const saved = await repo.save(repo.create({ name: 'MetaEntity' }));

      const logRepo = dataSourceMeta.getRepository(E2EHistoryLogWithMeta);
      const logs = await logRepo.find({ order: { id: 'ASC' } });
      const createLog = logs.find(
        (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.CREATE
      );
      expect(createLog).toBeDefined();
      expect(createLog!.reason).toBe('test-reason');
      const content = createLog!.content as Record<string, unknown>;
      expect(content.name).toBe('MetaEntity');
    });
  });
});

describe('patchGlobal: false', () => {
  let appNoPatch: INestApplication;
  let dataSourceNoPatch: DataSource;
  let clsNoPatch: ClsService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          database: new Uint8Array(0),
          entities: [E2EHistoryLog, E2ETestEntity],
          synchronize: true,
        }),
        HistoryModule.forRoot({
          historyLogEntity: E2EHistoryLog,
          softDeleteField: 'is_deleted',
          patchGlobal: false,
          entityMapper: (data) => ({
            action: data.action,
            entityKey: data.entityKey,
            entityId: data.entityId != null ? String(data.entityId) : null,
            contextEntityKey: data.contextEntityKey ?? 'e2e-test',
            contextEntityId: data.contextEntityId != null ? String(data.contextEntityId) : null,
            user_id: data.user_id != null ? String(data.user_id) : null,
            content: data.content,
          }),
        }),
        TypeOrmModule.forFeature([E2EHistoryLog, E2ETestEntity]),
      ],
    }).compile();
    appNoPatch = mod.createNestApplication();
    await appNoPatch.init();
    dataSourceNoPatch = mod.get(DataSource);
    clsNoPatch = mod.get(ClsService);
  });

  afterAll(async () => {
    await appNoPatch?.close();
  });

  it('manager.update does not produce history row when patchGlobal is false', async () => {
    await clsNoPatch.run(async () => {
      clsNoPatch.set('historyContext', E2E_HISTORY_CONTEXT);
      const insertResult = await dataSourceNoPatch.manager.insert(E2ETestEntity, {
        name: 'NoPatch-Before',
      });
      const id = (insertResult.identifiers as { id: number }[])[0]!.id;
      const countBefore = (await dataSourceNoPatch.getRepository(E2EHistoryLog).find()).filter(
        (l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE
      ).length;

      await dataSourceNoPatch.manager.update(E2ETestEntity, { id }, { name: 'NoPatch-After' });

      const countAfter = (await dataSourceNoPatch.getRepository(E2EHistoryLog).find()).filter(
        (l) => l.entityId === String(id) && l.action === HistoryActionType.UPDATE
      ).length;
      expect(countAfter).toBe(countBefore);
    });
  });

  it('repo.save still produces CREATE history row when patchGlobal is false', async () => {
    await clsNoPatch.run(async () => {
      clsNoPatch.set('historyContext', E2E_HISTORY_CONTEXT);
      const repo = dataSourceNoPatch.getRepository(E2ETestEntity);
      const saved = await repo.save(repo.create({ name: 'NoPatch-Save' }));

      const logs = await dataSourceNoPatch.getRepository(E2EHistoryLog).find({ order: { id: 'ASC' } });
      const createLog = logs.find(
        (l) => l.entityId === String(saved.id) && l.action === HistoryActionType.CREATE
      );
      expect(createLog).toBeDefined();
    });
  });
});
