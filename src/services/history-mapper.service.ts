import { Injectable } from '@nestjs/common';
import { HistoryLogLike, UnifiedHistoryContent } from '../interfaces/history.interface';
import { HistoryMapper, MapToEntityOptions } from '../utils/history-mapper.util';

/**
 * NestJS service wrapper for {@link HistoryMapper}.
 * Allows for dependency injection of mapping logic in controllers or services.
 */
@Injectable()
export class HistoryMapperService {
  /**
   * Casts a history log back into a typed Partial<T>.
   *
   * @template T - The entity type to cast to.
   * @param log - The history log instance.
   * @param options - Mapping options (side, unflatten).
   * @returns A partial of T representing the captured state.
   */
  mapToEntity<T = unknown>(
    log: HistoryLogLike,
    options: MapToEntityOptions = {},
  ): Partial<T> {
    return HistoryMapper.mapToEntity<T>(log, options);
  }

  /**
   * Transforms a history log into a unified side-by-side view.
   *
   * @template T - The entity type.
   * @param log - The history log instance.
   * @returns A unified view: { old: Partial<T> | null, new: Partial<T> | null }
   */
  mapToUnified<T = unknown>(
    log: HistoryLogLike,
  ): UnifiedHistoryContent<T> {
    return HistoryMapper.mapToUnified<T>(log);
  }
}
