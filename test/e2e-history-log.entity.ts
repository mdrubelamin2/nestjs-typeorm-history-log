import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HistoryActionType } from '../src/enums/history.enum';
import { HistoryContent } from '../src/interfaces/history.interface';

/**
 * SQLite-compatible history log entity for E2E only.
 * Same shape as HistoryLog but with explicit column types so better-sqlite3/sqlite accept it.
 */
@Entity('history_logs')
export class E2EHistoryLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'context_entity_key', type: 'varchar', length: 255 })
  contextEntityKey!: string;

  @Column({ name: 'context_entity_id', type: 'varchar', length: 255, nullable: true })
  contextEntityId!: string | null;

  @Column({ name: 'entity_key', type: 'varchar', length: 255 })
  entityKey!: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 255, nullable: true })
  entityId!: string | null;

  @Column({ name: 'action', type: 'varchar', length: 20 })
  action!: HistoryActionType;

  @Column({ name: 'content', type: 'simple-json' })
  content!: HistoryContent;

  @Column({ name: 'user_id', type: 'varchar', length: 255, nullable: true })
  user_id!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;
}
