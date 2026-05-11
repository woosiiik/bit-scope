/**
 * TypeORM DataSource 설정 (마이그레이션 CLI용)
 *
 * NestJS 앱 컨텍스트 외부에서 TypeORM CLI를 사용하여
 * 마이그레이션을 생성/실행할 때 사용하는 DataSource 설정이다.
 *
 * 사용법:
 *   npx typeorm migration:generate -d src/config/typeorm.datasource.ts src/migrations/InitialSchema
 *   npx typeorm migration:run -d src/config/typeorm.datasource.ts
 */

import { DataSource } from 'typeorm';

import { PortfolioSnapshotEntity } from '../modules/snapshot/entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from '../modules/snapshot/entities/snapshot-holding.entity';
import { AlertEntity } from '../modules/alert/entities/alert.entity';
import { AlertHistoryEntity } from '../modules/alert/entities/alert-history.entity';
import { ReportEntity } from '../modules/report/entities/report.entity';
import { ReportScheduleEntity } from '../modules/report/entities/report-schedule.entity';
import { KimchiPremiumHistoryEntity } from '../modules/premium/entities/kimchi-premium-history.entity';
import { PriceHistoryEntity } from '../modules/price/entities/price-history.entity';
import { CustomCalendarEventEntity } from '../modules/market-intel/entities/custom-calendar-event.entity';

const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'bitscope',
  password: process.env.DB_PASSWORD || 'bitscope',
  database: process.env.DB_DATABASE || 'bitscope',
  entities: [
    PortfolioSnapshotEntity,
    SnapshotHoldingEntity,
    AlertEntity,
    AlertHistoryEntity,
    ReportEntity,
    ReportScheduleEntity,
    KimchiPremiumHistoryEntity,
    PriceHistoryEntity,
    CustomCalendarEventEntity,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  timezone: '+09:00',
});

export default AppDataSource;
