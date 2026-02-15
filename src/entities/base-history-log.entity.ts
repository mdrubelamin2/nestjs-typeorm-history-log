import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HistoryActionType } from '../enums/history.enum';
import { HistoryContent } from '../interfaces/history.interface';

/**
 * Base entity for history logs. Extend this to create your project's history entity.
 */
export abstract class BaseHistoryLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'context_entity_key' })
  contextEntityKey: string;

  @Column({ name: 'context_entity_id', nullable: true })
  contextEntityId: string | number | null;

  @Column({ name: 'entity_key' })
  entityKey: string;

  @Column({ name: 'entity_id', nullable: true })
  entityId: string | number | null;

  @Column({
    type: 'enum',
    enum: HistoryActionType,
  })
  action: HistoryActionType;

  @Column({ type: 'json' })
  content: HistoryContent;

  @Column({ name: 'user_id', nullable: true })
  user_id: string | number | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
