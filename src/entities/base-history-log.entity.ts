import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HistoryActionType } from '../enums/history.enum';
import { HistoryContent } from '../interfaces/history.interface';

/**
 * Base entity for history logs. Default table shape: context_entity_key, context_entity_id,
 * entity_key, entity_id, action, content (JSON), user_id, created_at. For Tier 2 add columns via migration;
 * for Tier 3 extend and use a different table with {@link HistoryModuleOptions.entityMapper}.
 */
export abstract class BaseHistoryLog {
  /** Primary key. */
  @PrimaryGeneratedColumn()
  id!: number;

  /** Parent context key (e.g. 'project'). */
  @Column({ name: 'context_entity_key' })
  contextEntityKey!: string;

  /** Parent record id. */
  @Column({ name: 'context_entity_id', type: 'varchar', length: 255, nullable: true })
  contextEntityId!: string | number | null;

  /** Tracked entity key (e.g. 'project-entity'). */
  @Column({ name: 'entity_key' })
  entityKey!: string;

  /** Id of the record that was changed. */
  @Column({ name: 'entity_id', type: 'varchar', length: 255, nullable: true })
  entityId!: string | number | null;

  /** CREATE, UPDATE, or DELETE. Stored as varchar for SQLite/sqljs compatibility. */
  @Column({ type: 'varchar', length: 20 })
  action!: HistoryActionType;

  /** Diff or full state (JSON). */
  @Column({ type: 'json' })
  content!: HistoryContent;

  /** User who made the change. */
  @Column({ name: 'user_id', type: 'varchar', length: 255, nullable: true })
  user_id!: string | number | null;

  /** When the log was written. */
  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;
}
