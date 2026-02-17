import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { BaseHistoryLog } from '../entities/base-history-log.entity';
import { Observable } from 'rxjs';
import { HISTORY_CLS_CONTEXT_KEY, HISTORY_CONTEXT_KEY, HISTORY_OPTIONS } from '../history.constants';
import {
  HistoryContextData,
  HistoryContextOptions,
  HistoryModuleOptions,
} from '../interfaces/history.interface';

@Injectable()
export class HistoryContextInterceptor<T extends BaseHistoryLog = BaseHistoryLog> implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
    @Inject(HISTORY_OPTIONS)
    private readonly options: HistoryModuleOptions<T>,
  ) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<HistoryContextOptions>(
      HISTORY_CONTEXT_KEY,
      context.getHandler(),
    );

    if (options) {
      const request = context.switchToHttp().getRequest();

      return this.cls.run(() => {
        const { entityKey, idKey, location = 'params' } = options;

        const contextEntityId = request[location]?.[idKey || 'id'];
        const userRequestKey = this.options.userRequestKey || 'user';
        const user = request[userRequestKey];
        const userIdField = this.options.userIdField || 'id';
        const user_id = user?.[userIdField];

        const metadata = this.options.metadataProvider
          ? this.options.metadataProvider(request)
          : undefined;

        const historyContext: HistoryContextData<T> = {
          contextEntityKey: entityKey || 'UNKNOWN',
          contextEntityId,
          user_id,
          requestId: request.id || request.headers['x-request-id'],
          clientIp: request.ip,
          metadata,
        };

        this.cls.set(HISTORY_CLS_CONTEXT_KEY, historyContext);
        return next.handle();
      });
    }

    return next.handle();
  }
}
