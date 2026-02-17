import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  EntityHistoryTracker,
  HistoryColumnExclude,
  HistoryColumnInclude,
} from '../src/decorators/history.decorator';

/**
 * Minimal entity used only in E2E tests to trigger history logging.
 */
@Entity('e2e_test_entity')
@EntityHistoryTracker({ entityKey: 'e2e-test' })
export class E2ETestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  name!: string;

  @HistoryColumnInclude()
  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_at!: string | null;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;

  @HistoryColumnExclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  secret!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  internal!: string | null;
}
