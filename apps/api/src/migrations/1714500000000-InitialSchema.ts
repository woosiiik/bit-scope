/**
 * 초기 데이터베이스 스키마 마이그레이션
 *
 * BitScope에서 사용하는 모든 테이블을 생성한다:
 * - portfolio_snapshot: 포트폴리오 스냅샷
 * - snapshot_holding: 스냅샷 보유 코인 내역
 * - alert: 알림 설정
 * - alert_history: 알림 발생 이력
 * - report: 리포트
 * - report_schedule: 정기 리포트 스케줄
 * - kimchi_premium_history: 김치 프리미엄 이력
 * - price_history: 가격 이력
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1714500000000 implements MigrationInterface {
  name = 'InitialSchema1714500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 포트폴리오 스냅샷 테이블
    await queryRunner.query(`
      CREATE TABLE \`portfolio_snapshot\` (
        \`id\` varchar(36) NOT NULL,
        \`wallet_address\` varchar(42) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`total_evaluation\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`total_investment\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`total_profit_loss\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`profit_loss_rate\` decimal(10,4) NOT NULL DEFAULT '0.0000',
        PRIMARY KEY (\`id\`),
        INDEX \`idx_snapshot_wallet\` (\`wallet_address\`),
        INDEX \`idx_snapshot_wallet_created\` (\`wallet_address\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 스냅샷 보유 코인 테이블
    await queryRunner.query(`
      CREATE TABLE \`snapshot_holding\` (
        \`id\` varchar(36) NOT NULL,
        \`snapshot_id\` varchar(36) NOT NULL,
        \`symbol\` varchar(20) NOT NULL,
        \`exchange\` varchar(20) NOT NULL,
        \`balance\` decimal(30,8) NOT NULL DEFAULT '0.00000000',
        \`avg_buy_price\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`current_price\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`evaluation\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        PRIMARY KEY (\`id\`),
        INDEX \`idx_holding_snapshot\` (\`snapshot_id\`),
        CONSTRAINT \`fk_holding_snapshot\` FOREIGN KEY (\`snapshot_id\`)
          REFERENCES \`portfolio_snapshot\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 알림 설정 테이블
    await queryRunner.query(`
      CREATE TABLE \`alert\` (
        \`id\` varchar(36) NOT NULL,
        \`wallet_address\` varchar(42) NOT NULL,
        \`symbol\` varchar(20) NOT NULL,
        \`exchange\` varchar(20) NULL,
        \`condition\` varchar(20) NOT NULL,
        \`target_value\` decimal(20,4) NOT NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_alert_wallet\` (\`wallet_address\`),
        INDEX \`idx_alert_wallet_active\` (\`wallet_address\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 알림 발생 이력 테이블
    await queryRunner.query(`
      CREATE TABLE \`alert_history\` (
        \`id\` varchar(36) NOT NULL,
        \`alert_id\` varchar(36) NOT NULL,
        \`triggered_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`triggered_value\` decimal(20,4) NOT NULL,
        \`message\` varchar(500) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_alert_history_alert\` (\`alert_id\`),
        INDEX \`idx_alert_history_triggered\` (\`triggered_at\`),
        CONSTRAINT \`fk_history_alert\` FOREIGN KEY (\`alert_id\`)
          REFERENCES \`alert\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 리포트 테이블
    await queryRunner.query(`
      CREATE TABLE \`report\` (
        \`id\` varchar(36) NOT NULL,
        \`wallet_address\` varchar(42) NOT NULL,
        \`type\` varchar(20) NOT NULL,
        \`generated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`period_start\` timestamp NOT NULL,
        \`period_end\` timestamp NOT NULL,
        \`summary\` json NOT NULL,
        \`data\` json NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_report_wallet\` (\`wallet_address\`),
        INDEX \`idx_report_wallet_generated\` (\`wallet_address\`, \`generated_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 리포트 스케줄 테이블
    await queryRunner.query(`
      CREATE TABLE \`report_schedule\` (
        \`id\` varchar(36) NOT NULL,
        \`wallet_address\` varchar(42) NOT NULL,
        \`type\` varchar(20) NOT NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`next_run_at\` timestamp NOT NULL,
        \`cron_expression\` varchar(50) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_schedule_wallet\` (\`wallet_address\`),
        INDEX \`idx_schedule_active_next\` (\`is_active\`, \`next_run_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 김치 프리미엄 이력 테이블
    await queryRunner.query(`
      CREATE TABLE \`kimchi_premium_history\` (
        \`id\` varchar(36) NOT NULL,
        \`symbol\` varchar(20) NOT NULL,
        \`upbit_price\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`bithumb_price\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`coinone_price\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`premium_rate\` decimal(10,4) NOT NULL DEFAULT '0.0000',
        \`recorded_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_premium_symbol_recorded\` (\`symbol\`, \`recorded_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 가격 이력 테이블
    await queryRunner.query(`
      CREATE TABLE \`price_history\` (
        \`id\` varchar(36) NOT NULL,
        \`symbol\` varchar(20) NOT NULL,
        \`exchange\` varchar(20) NOT NULL,
        \`price\` decimal(20,4) NOT NULL DEFAULT '0.0000',
        \`volume_24h\` decimal(30,8) NOT NULL DEFAULT '0.00000000',
        \`recorded_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_price_symbol_exchange_recorded\` (\`symbol\`, \`exchange\`, \`recorded_at\`),
        INDEX \`idx_price_recorded\` (\`recorded_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`price_history\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`kimchi_premium_history\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`report_schedule\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`report\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`alert_history\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`alert\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`snapshot_holding\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`portfolio_snapshot\``);
  }
}
