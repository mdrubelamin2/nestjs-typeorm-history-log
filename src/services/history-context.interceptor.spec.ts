import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { HistoryContextInterceptor } from './history-context.interceptor';
import { HISTORY_CLS_CONTEXT_KEY, HISTORY_CONTEXT_KEY, HISTORY_OPTIONS } from '../history.constants';

describe('HistoryContextInterceptor', () => {
  let interceptor: HistoryContextInterceptor;
  let mockReflector: jest.Mocked<Reflector>;
  let mockCls: jest.Mocked<Pick<ClsService, 'run' | 'set'>>;
  let mockOptions: { userRequestKey?: string; userIdField?: string; metadataProvider?: (req: unknown) => Record<string, unknown> };
  let mockNext: CallHandler;
  let mockContext: ExecutionContext;

  function createRequest(overrides: Record<string, unknown> = {}) {
    return {
      params: {},
      body: {},
      query: {},
      user: { id: 'user-1' },
      id: undefined,
      headers: {},
      ip: '127.0.0.1',
      ...overrides,
    };
  }

  beforeEach(() => {
    mockReflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    mockCls = {
      run: jest.fn((fn: () => unknown) => {
        const result = fn();
        return result;
      }),
      set: jest.fn(),
    } as unknown as jest.Mocked<Pick<ClsService, 'run' | 'set'>>;

    mockOptions = {
      userRequestKey: 'user',
      userIdField: 'id',
    };

    mockNext = {
      handle: jest.fn().mockReturnValue(of(undefined)),
    } as unknown as CallHandler;

    mockContext = {
      getHandler: jest.fn().mockReturnValue(() => {}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => createRequest(),
      }),
    } as unknown as ExecutionContext;

    interceptor = new HistoryContextInterceptor(
      mockReflector,
      mockCls as unknown as ClsService,
      mockOptions as never,
    );
  });

  it('calls next.handle() without CLS.run when decorator is absent', () => {
    mockReflector.get.mockReturnValue(undefined);

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.run).not.toHaveBeenCalled();
    expect(mockNext.handle).toHaveBeenCalledTimes(1);
  });

  it('invokes CLS.run and sets context with params when decorator has location params', () => {
    const request = createRequest({ params: { id: '42' } });
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });
    mockReflector.get.mockReturnValue({ entityKey: 'project', idKey: 'id', location: 'params' as const });

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.run).toHaveBeenCalledTimes(1);
    expect(mockCls.set).toHaveBeenCalledWith(
      HISTORY_CLS_CONTEXT_KEY,
      expect.objectContaining({
        contextEntityKey: 'project',
        contextEntityId: '42',
        user_id: 'user-1',
      })
    );
    expect(mockNext.handle).toHaveBeenCalledTimes(1);
  });

  it('reads contextEntityId from body when location is body', () => {
    const request = createRequest({ body: { id: 99 } });
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });
    mockReflector.get.mockReturnValue({ entityKey: 'e2e-test', idKey: 'id', location: 'body' as const });

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.set).toHaveBeenCalledWith(
      HISTORY_CLS_CONTEXT_KEY,
      expect.objectContaining({
        contextEntityKey: 'e2e-test',
        contextEntityId: 99,
        user_id: 'user-1',
      })
    );
  });

  it('reads contextEntityId from query when location is query', () => {
    const request = createRequest({ query: { id: 'abc' } });
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });
    mockReflector.get.mockReturnValue({ entityKey: 'resource', idKey: 'id', location: 'query' as const });

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.set).toHaveBeenCalledWith(
      HISTORY_CLS_CONTEXT_KEY,
      expect.objectContaining({
        contextEntityKey: 'resource',
        contextEntityId: 'abc',
        user_id: 'user-1',
      })
    );
  });

  it('uses custom idKey when provided', () => {
    const request = createRequest({ params: { uuid: 'uuid-123' } });
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });
    mockReflector.get.mockReturnValue({ entityKey: 'x', idKey: 'uuid', location: 'params' as const });

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.set).toHaveBeenCalledWith(
      HISTORY_CLS_CONTEXT_KEY,
      expect.objectContaining({
        contextEntityId: 'uuid-123',
      })
    );
  });

  it('uses userRequestKey and userIdField from options', () => {
    mockOptions.userRequestKey = 'actor';
    mockOptions.userIdField = 'uuid';
    interceptor = new HistoryContextInterceptor(
      mockReflector,
      mockCls as unknown as ClsService,
      mockOptions as never,
    );
    const request = createRequest({ params: {}, actor: { uuid: 'actor-456' } });
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });
    mockReflector.get.mockReturnValue({ entityKey: 'e2e-test', location: 'params' as const });

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.set).toHaveBeenCalledWith(
      HISTORY_CLS_CONTEXT_KEY,
      expect.objectContaining({
        user_id: 'actor-456',
      })
    );
  });

  it('includes metadata from metadataProvider when provided', () => {
    mockOptions.metadataProvider = (req: unknown) => ({ ip: (req as { ip?: string }).ip ?? '0.0.0.0' });
    interceptor = new HistoryContextInterceptor(
      mockReflector,
      mockCls as unknown as ClsService,
      mockOptions as never,
    );
    const request = createRequest({ params: {}, ip: '192.168.1.1' });
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({ getRequest: () => request });
    mockReflector.get.mockReturnValue({ entityKey: 'e2e-test', location: 'params' as const });

    interceptor.intercept(mockContext, mockNext);

    expect(mockCls.set).toHaveBeenCalledWith(
      HISTORY_CLS_CONTEXT_KEY,
      expect.objectContaining({
        metadata: { ip: '192.168.1.1' },
      })
    );
  });
});
