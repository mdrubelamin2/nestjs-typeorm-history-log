import { HistoryModule } from './history.module';
import { HistoryLog } from './entities/history-log.entity';
import { HistoryHelper } from './services/history.helper';
import { HISTORY_OPTIONS } from './history.constants';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HistoryContextInterceptor } from './services/history-context.interceptor';

describe('HistoryModule', () => {
  it('forRoot() returns a DynamicModule', () => {
    const mod = HistoryModule.forRoot();
    expect(mod.module).toBe(HistoryModule);
    expect(mod.imports).toBeDefined();
    expect(mod.providers).toBeDefined();
    expect(mod.exports).toContain(HistoryHelper);
  });

  it('forRoot() defaults to HistoryLog entity and patchGlobal true', () => {
    const mod = HistoryModule.forRoot();
    const optionsProvider = mod.providers!.find(
      (p: any) => p && (p.provide === HISTORY_OPTIONS || p.token === HISTORY_OPTIONS)
    ) as any;
    expect(optionsProvider).toBeDefined();
    expect(optionsProvider.useValue.historyLogEntity).toBe(HistoryLog);
    expect(optionsProvider.useValue.patchGlobal).toBe(true);
  });

  it('forRoot({ patchGlobal: false }) does not register APP_INTERCEPTOR', () => {
    const mod = HistoryModule.forRoot({ patchGlobal: false } as any);
    const interceptorProvider = mod.providers!.find(
      (p: any) => p && p.provide === APP_INTERCEPTOR
    );
    expect(interceptorProvider).toBeUndefined();
  });

  it('forRoot({ patchGlobal: true }) registers APP_INTERCEPTOR', () => {
    const mod = HistoryModule.forRoot();
    const interceptorProvider = mod.providers!.find(
      (p: any) => p && p.provide === APP_INTERCEPTOR
    ) as any;
    expect(interceptorProvider).toBeDefined();
    expect(interceptorProvider.useExisting).toBe(HistoryContextInterceptor);
  });
});
