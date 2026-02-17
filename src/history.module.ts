import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { BaseHistoryLog } from './entities/base-history-log.entity';
import { HISTORY_OPTIONS } from './history.constants';
import { HistoryModuleOptions } from './interfaces/history.interface';
import { HistoryHelper } from './services/history.helper';
import { HistorySubscriber } from './services/history.subscriber';
import { HistoryContextInterceptor } from './services/history-context.interceptor';
import { HistoryLog } from './entities/history-log.entity';
import { HistoryMapperService } from './services/history-mapper.service';

/**
 * NestJS module for automatic history logging of TypeORM entity changes.
 * Register with `HistoryModule.forRoot()` in your app; use {@link EntityHistoryTracker} on entities
 * and {@link HistoryContext} on routes to capture who changed what and when.
 *
 * @see {@link HistoryModuleOptions} for configuration options.
 */
@Global()
@Module({})
export class HistoryModule {
  /**
   * Registers the history module with optional configuration.
   * Use the default entity and table, or pass a custom entity/mapper for Tier 2 or Tier 3.
   *
   * @param options - Module options (entity, user resolution, ignored keys, etc.). See {@link HistoryModuleOptions}.
   * @returns NestJS DynamicModule for use in `imports: [HistoryModule.forRoot()]`.
   */
  static forRoot<T = HistoryLog, P extends boolean = true>(
    options: HistoryModuleOptions<T, P> = {} as HistoryModuleOptions<T, P>,
  ): DynamicModule {
    const finalOptions = {
      historyLogEntity: HistoryLog,
      patchGlobal: true, // Default to true
      ...options,
    };

    const providers: Provider[] = [
      HistoryHelper,
      HistorySubscriber,
      HistoryContextInterceptor,
      HistoryMapperService,
      {
        provide: HISTORY_OPTIONS,
        useValue: finalOptions,
      },
    ];

    if (finalOptions.patchGlobal) {
      providers.push({
        provide: APP_INTERCEPTOR,
        useExisting: HistoryContextInterceptor,
      });
    }

    return {
      module: HistoryModule,
      imports: [
        TypeOrmModule.forFeature([finalOptions.historyLogEntity]),
        ClsModule.forRoot({
          global: true,
          middleware: { mount: true },
        }),
      ],
      providers,
      exports: [HistoryHelper, HistoryContextInterceptor, HistoryMapperService, ClsModule],
    };
  }
}
