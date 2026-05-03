/**
 * TypeORM 데이터베이스 설정
 *
 * 환경 변수를 통해 MySQL 연결 정보를 관리한다.
 * OCI Free Tier MySQL 인스턴스와의 연결을 위한 기본 설정을 포함한다.
 */

import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { PortfolioSnapshotEntity } from '../modules/snapshot/entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from '../modules/snapshot/entities/snapshot-holding.entity';
import { AlertEntity } from '../modules/alert/entities/alert.entity';
import { AlertHistoryEntity } from '../modules/alert/entities/alert-history.entity';
import { ReportEntity } from '../modules/report/entities/report.entity';
import { ReportScheduleEntity } from '../modules/report/entities/report-schedule.entity';
import { KimchiPremiumHistoryEntity } from '../modules/premium/entities/kimchi-premium-history.entity';
import { PriceHistoryEntity } from '../modules/price/entities/price-history.entity';
import { TelegramConnectionEntity } from '../modules/telegram/entities/telegram-connection.entity';

/** 모든 TypeORM 엔티티 목록 */
export const ENTITIES = [
  PortfolioSnapshotEntity,
  SnapshotHoldingEntity,
  AlertEntity,
  AlertHistoryEntity,
  ReportEntity,
  ReportScheduleEntity,
  KimchiPremiumHistoryEntity,
  PriceHistoryEntity,
  TelegramConnectionEntity,
];

/**
 * TypeORM 데이터베이스 설정을 반환한다.
 * 환경 변수에서 연결 정보를 읽어오며, 기본값은 로컬 개발 환경에 맞춰져 있다.
 */
export function getDatabaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'bitscope',
    password: process.env.DB_PASSWORD || 'bitscope',
    database: process.env.DB_DATABASE || 'bitscope',
    entities: ENTITIES,
    // 개발 환경에서만 synchronize 활성화, 프로덕션에서는 마이그레이션 사용
    synchronize: process.env.NODE_ENV !== 'production',
    // 커넥션 풀 설정 (OCI Free Tier 리소스 절약)
    extra: {
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      // MySQL 8.4 caching_sha2_password: 로컬 개발 시 SSL 없이 접속 허용
      ssl: false,
      authPlugins: undefined,
    },
    // 로깅 설정
    logging: process.env.DB_LOGGING === 'true',
    // 타임존 설정
    timezone: '+09:00',
    // 자동 로드 비활성화 (명시적 엔티티 등록 사용)
    autoLoadEntities: false,
    // 커넥션 재시도 설정
    retryAttempts: 3,
    retryDelay: 3000,
  };
}
