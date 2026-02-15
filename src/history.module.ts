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

@Global()
@Module({})
export class HistoryModule {
  static forRoot<T = HistoryLog, P extends boolean = true>(
    options: HistoryModuleOptions<T, P> = {} as any,
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
      exports: [HistoryHelper, HistoryContextInterceptor, ClsModule],
    };
  }
}
