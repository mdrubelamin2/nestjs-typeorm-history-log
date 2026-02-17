import { HistoryHelper } from './history.helper';
import { Between, DataSource, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { HISTORY_CLS_CONTEXT_KEY, HISTORY_IGNORE_KEY } from '../history.constants';
import { HistoryLog } from '../entities/history-log.entity';
import { HistoryActionType } from '../enums/history.enum';
import { HistoryMapperService } from './history-mapper.service';

class DummyEntity {
  id!: number;
  name!: string;
}

describe('HistoryHelper', () => {
  let helper: HistoryHelper;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockCls: jest.Mocked<Pick<ClsService, 'isActive' | 'get' | 'set' | 'runWith'>>;
  let mockManager: { getRepository: jest.Mock; save: jest.Mock; queryRunner?: any };
  let mockHistoryMapperService: jest.Mocked<HistoryMapperService>;

  const defaultOptions = {
    historyLogEntity: HistoryLog,
    ignoredKeys: [] as string[],
  };

  beforeEach(() => {
    mockManager = {
      getRepository: jest.fn().mockReturnValue({
        create: (data: any) => ({ ...data }),
        save: jest.fn().mockResolvedValue(undefined),
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue({
        getId: (data: any) => data?.id ?? 1,
      }),
    } as any;

    mockCls = {
      isActive: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      runWith: jest.fn((_context: any, callback: () => any) => callback()),
    };

    mockHistoryMapperService = {
      mapToUnified: jest.fn(),
      mapToEntity: jest.fn(),
    } as any;

    helper = new HistoryHelper(
      mockDataSource as DataSource,
      mockCls as unknown as ClsService,
      mockHistoryMapperService as unknown as HistoryMapperService,
      defaultOptions as any
    );
  });

  describe('saveLog', () => {
    it('throws when context has no user_id', async () => {
      mockManager.getRepository.mockReturnValue({ create: (x: any) => x, save: jest.fn() });

      await expect(
        helper.saveLog({
          logData: {
            entityKey: 'test',
            action: HistoryActionType.CREATE,
            entityTarget: DummyEntity,
            oldState: {},
            payload: { id: 1, name: 'Test' },
          },
          manager: mockManager as any,
        })
      ).rejects.toThrow(/Strict Auditing Violation.*user_id/);
    });

    it('saves log when context has user_id (manual context)', async () => {
      const repo = { create: (x: any) => x };
      mockManager.getRepository.mockReturnValue(repo);

      await helper.saveLog({
        logData: {
          entityKey: 'test',
          action: HistoryActionType.CREATE,
          entityTarget: DummyEntity,
          oldState: {},
          payload: { id: 1, name: 'Test' },
        },
        manager: mockManager as any,
        context: { user_id: 1, contextEntityKey: 'project', contextEntityId: '10' },
      });

      expect(mockManager.getRepository).toHaveBeenCalledWith(HistoryLog);
      expect(mockManager.save).toHaveBeenCalledWith(HistoryLog, expect.any(Object));
    });

    it('skips saving when UPDATE has no diff (empty content)', async () => {
      const repo = { create: (x: any) => x };
      mockManager.getRepository.mockReturnValue(repo);

      await helper.saveLog({
        logData: {
          entityKey: 'test',
          action: HistoryActionType.UPDATE,
          entityTarget: DummyEntity,
          oldState: { id: 1, name: 'Same' },
          payload: { id: 1, name: 'Same' },
        },
        manager: mockManager as any,
        context: { user_id: 1, contextEntityKey: 'project', contextEntityId: '10' },
      });

      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('addMetadata', () => {
    it('merges metadata into historyContext when CLS is active', () => {
      const existing = { metadata: { ip: '1.2.3.4' } };
      mockCls.get.mockReturnValue(existing);

      helper.addMetadata({ reason: 'patch' } as any);

      expect(mockCls.set).toHaveBeenCalledWith(HISTORY_CLS_CONTEXT_KEY, {
        metadata: { ip: '1.2.3.4', reason: 'patch' },
      });
    });

    it('does nothing when CLS is not active', () => {
      mockCls.isActive.mockReturnValue(false);
      helper.addMetadata({ reason: 'patch' } as any);
      expect(mockCls.set).not.toHaveBeenCalled();
    });
  });

  describe('ignore', () => {
    it('runs callback inside CLS.runWith with HISTORY_IGNORE_KEY true', async () => {
      const fn = jest.fn().mockResolvedValue(42);
      const result = await helper.ignore(fn);

      expect(result).toBe(42);
      expect(mockCls.runWith).toHaveBeenCalledWith(
        expect.objectContaining({ [HISTORY_IGNORE_KEY]: true }),
        expect.any(Function)
      );
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('calls findAndCount with merged where and default order', async () => {
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      await helper.findAll({ entityKey: 'project', page: 1, limit: 10 });

      expect(mockDataSource.getRepository).toHaveBeenCalledWith(HistoryLog);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityKey: 'project' }),
          take: 10,
          skip: 0,
          order: { created_at: 'DESC' },
        })
      );
    });

    it('delegates to historyMapperService.mapToUnified by default', async () => {
      const items = [{ action: HistoryActionType.CREATE, content: { name: 'Alice' } }];
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([items, 1]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      const expectedUnified = { old: null, new: { name: 'Alice' } };
      mockHistoryMapperService.mapToUnified.mockReturnValue(expectedUnified as any);

      const result = await helper.findAll();

      const first = result.items[0];
      expect(first).toBeDefined();
      expect(first!.content).toEqual(expectedUnified);
      expect(mockHistoryMapperService.mapToUnified).toHaveBeenCalledWith(items[0]);
    });

    it('returns raw content when unflatten is false', async () => {
      const items = [
        {
          action: HistoryActionType.UPDATE,
          content: { 'name': { old: 'Alice', new: 'Bob' } },
        },
      ];
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([items, 1]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      const result = await helper.findAll({ unflatten: false });

      const first = result.items[0];
      expect(first).toBeDefined();
      expect(first!.content).toEqual({ 'name': { old: 'Alice', new: 'Bob' } });
      // Should NOT call the mapper
      expect(mockHistoryMapperService.mapToUnified).not.toHaveBeenCalled();
    });

    it('includes entityId in where when passed', async () => {
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      await helper.findAll({ entityId: 1, page: 1, limit: 10 });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 1 }),
        })
      );
    });

    it('includes Between(fromDate, toDate) for created_at when both fromDate and toDate passed', async () => {
      const d1 = new Date('2024-01-01');
      const d2 = new Date('2024-12-31');
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      await helper.findAll({ fromDate: d1, toDate: d2, page: 1, limit: 10 });

      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where.created_at).toBeDefined();
      expect(call.where.created_at).toEqual(Between(d1, d2));
    });

    it('includes MoreThanOrEqual(fromDate) for created_at when only fromDate passed', async () => {
      const d1 = new Date('2024-01-01');
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      await helper.findAll({ fromDate: d1, page: 1, limit: 10 });

      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where.created_at).toBeDefined();
      expect(call.where.created_at).toEqual(MoreThanOrEqual(d1));
    });

    it('includes LessThanOrEqual(toDate) for created_at when only toDate passed', async () => {
      const d2 = new Date('2024-12-31');
      const mockRepo = {
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockDataSource.getRepository = jest.fn().mockReturnValue(mockRepo);

      await helper.findAll({ toDate: d2, page: 1, limit: 10 });

      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where.created_at).toBeDefined();
      expect(call.where.created_at).toEqual(LessThanOrEqual(d2));
    });
  });
});
