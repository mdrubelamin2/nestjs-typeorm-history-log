import { Entity } from 'typeorm';
import { BaseHistoryLog } from './base-history-log.entity';

@Entity('history_logs')
export class HistoryLog extends BaseHistoryLog { }
