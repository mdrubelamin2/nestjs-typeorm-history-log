import { Entity } from 'typeorm';
import { BaseHistoryLog } from './base-history-log.entity';

/**
 * Default history log entity (table `history_logs`). Use as-is for Tier 1, or extend / replace
 * with a custom entity and {@link HistoryModuleOptions.entityMapper} for Tier 2/3.
 */
@Entity('history_logs')
export class HistoryLog extends BaseHistoryLog { }
