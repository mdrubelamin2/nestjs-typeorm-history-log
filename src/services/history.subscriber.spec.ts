import { HistorySubscriber } from './history.subscriber';
import { DataSource, InsertEvent, UpdateEvent, RemoveEvent, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { HistoryHelper } from './history.helper';
import { HistoryActionType } from '../enums/history.enum';

describe('HistorySubscriber', () => {
  let subscriber: HistorySubscriber;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockCls: jest.Mocked<ClsService>;
  let mockHistoryHelper: jest.Mocked<HistoryHelper<any>>;
  let mockManager: jest.Mocked<EntityManager>;

  const mockMetadata = {
    target: class TestEntity { },
    name: 'TestEntity',
    primaryColumns: [{ propertyName: 'id' }],
    columns: [{ propertyName: 'id' }, { propertyName: 'name' }],
  } as any;

  beforeEach(() => {
    mockDataSource = {
      subscribers: [],
    } as any;
    mockCls = {
      isActive: jest.fn().mockReturnValue(true),
      get: jest.fn(),
    } as any;
    mockHistoryHelper = {
      saveLog: jest.fn(),
    } as any;
    mockManager = {
      getRepository: jest.fn().mockReturnValue({
        getId: (entity: any) => entity?.id,
      }),
      findOne: jest.fn(),
      find: jest.fn(),
    } as any;

    subscriber = new HistorySubscriber(
      mockDataSource as any,
      mockCls as any,
      mockHistoryHelper as any,
      { historyLogEntity: class Log { } } as any,
    );
  });

  describe('isDataComplete', () => {
    it('returns true if all PKs and columns are present', () => {
      const data = { id: 1, name: 'Test' };
      expect((subscriber as any).isDataComplete(data, mockMetadata)).toBe(true);
    });

    it('returns false if PK is missing', () => {
      const data = { name: 'Test' };
      expect((subscriber as any).isDataComplete(data, mockMetadata)).toBe(false);
    });

    it('returns false if a tracked column is missing', () => {
      const data = { id: 1 };
      expect((subscriber as any).isDataComplete(data, mockMetadata)).toBe(false);
    });

    it('returns false if data is null', () => {
      expect((subscriber as any).isDataComplete(null, mockMetadata)).toBe(false);
    });
  });

  describe('afterInsert', () => {
    it('skips findOne if entity is complete', async () => {
      const event: InsertEvent<any> = {
        metadata: mockMetadata,
        entity: { id: 1, name: 'New' },
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      // Mock shouldTrack to true
      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      // Mock processLog
      const processLogSpy = jest.spyOn(subscriber as any, 'processLog').mockResolvedValue(undefined);

      await subscriber.afterInsert(event);

      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(processLogSpy).toHaveBeenCalledWith(
        event.entity,
        null,
        HistoryActionType.CREATE,
        mockMetadata.target,
        mockManager,
      );
    });

    it('calls findOne if entity is incomplete', async () => {
      const event: InsertEvent<any> = {
        metadata: mockMetadata,
        entity: { id: 1 }, // Missing 'name'
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      const fetchedEntity = { id: 1, name: 'Fetched' };
      mockManager.findOne.mockResolvedValue(fetchedEntity);

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const processLogSpy = jest.spyOn(subscriber as any, 'processLog').mockResolvedValue(undefined);

      await subscriber.afterInsert(event);

      expect(mockManager.findOne).toHaveBeenCalled();
      expect(processLogSpy).toHaveBeenCalledWith(
        fetchedEntity,
        null,
        HistoryActionType.CREATE,
        mockMetadata.target,
        mockManager,
      );
    });
  });

  describe('beforeUpdate', () => {
    it('skips find if databaseEntity is complete', async () => {
      const event: UpdateEvent<any> = {
        metadata: mockMetadata,
        entity: { name: 'Updated' },
        databaseEntity: { id: 1, name: 'Old' },
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const bufferLogSpy = jest.spyOn((subscriber as any).carrier, 'bufferLog');

      await subscriber.beforeUpdate(event);

      expect(mockManager.find).not.toHaveBeenCalled();
      expect(bufferLogSpy).toHaveBeenCalled();
    });

    it('calls find if databaseEntity is incomplete', async () => {
      const event: UpdateEvent<any> = {
        metadata: mockMetadata,
        entity: { name: 'Updated' },
        databaseEntity: { id: 1 }, // Missing 'name'
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      mockManager.find.mockResolvedValue([{ id: 1, name: 'Old' }]);

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const bufferLogSpy = jest.spyOn((subscriber as any).carrier, 'bufferLog');

      await subscriber.beforeUpdate(event);

      expect(mockManager.find).toHaveBeenCalled();
      expect(bufferLogSpy).toHaveBeenCalled();
    });

    it('handles bulk save([list]) by optimizing each item', async () => {
      // simulate bulk save where subscriber fires per entity
      const entities = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ];

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const processLogSpy = jest.spyOn(subscriber as any, 'processLog').mockResolvedValue(undefined);

      for (const entity of entities) {
        const event = {
          metadata: mockMetadata,
          entity,
          manager: mockManager,
          queryRunner: { data: {} } as any,
        } as any;
        await subscriber.afterInsert(event);
      }

      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(processLogSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back for Repository.update() where databaseEntity is missing', async () => {
      // Repository.update() usually provides partial entity and no databaseEntity
      const event: UpdateEvent<any> = {
        metadata: mockMetadata,
        entity: { name: 'Updated' }, // partial
        databaseEntity: undefined, // missing
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      mockManager.find.mockResolvedValue([{ id: 1, name: 'Old' }]);

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const bufferLogSpy = jest.spyOn((subscriber as any).carrier, 'bufferLog');

      await subscriber.beforeUpdate(event);

      expect(mockManager.find).toHaveBeenCalled();
      expect(bufferLogSpy).toHaveBeenCalled();
    });
  });

  describe('beforeRemove', () => {
    it('skips find if databaseEntity is complete', async () => {
      const event: RemoveEvent<any> = {
        metadata: mockMetadata,
        databaseEntity: { id: 1, name: 'To Delete' },
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const bufferLogSpy = jest.spyOn((subscriber as any).carrier, 'bufferLog');

      await subscriber.beforeRemove(event);

      expect(mockManager.find).not.toHaveBeenCalled();
      expect(bufferLogSpy).toHaveBeenCalled();
    });

    it('calls find if databaseEntity is incomplete', async () => {
      const event: RemoveEvent<any> = {
        metadata: mockMetadata,
        databaseEntity: null,
        entityId: 1,
        manager: mockManager,
        queryRunner: { data: {} } as any,
      } as any;

      mockManager.find.mockResolvedValue([{ id: 1, name: 'To Delete' }]);

      jest.spyOn(subscriber as any, 'shouldTrack').mockReturnValue(true);
      const bufferLogSpy = jest.spyOn((subscriber as any).carrier, 'bufferLog');

      await subscriber.beforeRemove(event);

      expect(mockManager.find).toHaveBeenCalled();
      expect(bufferLogSpy).toHaveBeenCalled();
    });
  });
});
