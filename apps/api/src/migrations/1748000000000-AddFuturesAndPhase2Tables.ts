/**
 * 선물 대시보드 / Phase 2 테이블 마이그레이션
 *
 * InitialSchema 이후 추가된 선물 기능 테이블을 생성한다.
 * 프로덕션(synchronize=false)에서 자동 생성되지 않으므로 명시적 마이그레이션이 필요하다.
 *
 * - liquidation: 강제 청산 이벤트 (WebSocket/REST 수집)
 * - funding_oi_snapshot: 거래소별 펀딩/OI 1시간 스냅샷
 * - taker_volume_snapshot: Binance taker buy/sell 1시간 스냅샷
 * - basis_snapshot: 분기 선물/현물 가격 1시간 스냅샷
 *
 * dev 환경에서 synchronize로 이미 생성됐을 수 있어 CREATE TABLE IF NOT EXISTS를 사용한다.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFuturesAndPhase2Tables1748000000000
  implements MigrationInterface
{
  name = 'AddFuturesAndPhase2Tables1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 청산 이벤트
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`liquidation\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`symbol\` varchar(20) NOT NULL,
        \`exchange\` varchar(20) NOT NULL,
        \`side\` varchar(10) NOT NULL,
        \`quantity\` decimal(20,8) NOT NULL DEFAULT '0',
        \`price\` decimal(20,8) NOT NULL DEFAULT '0',
        \`usd_value\` decimal(20,4) NOT NULL DEFAULT '0',
        \`timestamp\` bigint NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_liq_symbol_time\` (\`symbol\`, \`timestamp\`),
        KEY \`idx_liq_exchange_time\` (\`exchange\`, \`timestamp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 펀딩/OI 스냅샷
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`funding_oi_snapshot\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`symbol\` varchar(20) NOT NULL,
        \`exchange\` varchar(20) NOT NULL,
        \`funding_rate\` decimal(20,10) NOT NULL DEFAULT '0',
        \`open_interest\` decimal(20,4) NOT NULL DEFAULT '0',
        \`timestamp\` bigint NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_fos_symbol_exchange_time\` (\`symbol\`, \`exchange\`, \`timestamp\`),
        KEY \`idx_fos_symbol_time\` (\`symbol\`, \`timestamp\`),
        KEY \`idx_fos_exchange_time\` (\`exchange\`, \`timestamp\`),
        KEY \`idx_fos_timestamp\` (\`timestamp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Taker buy/sell 스냅샷
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`taker_volume_snapshot\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`symbol\` varchar(20) NOT NULL,
        \`exchange\` varchar(20) NOT NULL DEFAULT 'binance',
        \`buy_volume\` decimal(20,4) NOT NULL DEFAULT '0',
        \`sell_volume\` decimal(20,4) NOT NULL DEFAULT '0',
        \`timestamp\` bigint NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tvs_symbol_exchange_time\` (\`symbol\`, \`exchange\`, \`timestamp\`),
        KEY \`idx_tvs_symbol_time\` (\`symbol\`, \`timestamp\`),
        KEY \`idx_tvs_timestamp\` (\`timestamp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 베이시스 스냅샷
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`basis_snapshot\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`symbol\` varchar(20) NOT NULL,
        \`futures_price\` decimal(20,8) NOT NULL DEFAULT '0',
        \`spot_price\` decimal(20,8) NOT NULL DEFAULT '0',
        \`delivery_date\` bigint NOT NULL DEFAULT '0',
        \`timestamp\` bigint NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_bs_symbol_time\` (\`symbol\`, \`timestamp\`),
        KEY \`idx_bs_symbol_time\` (\`symbol\`, \`timestamp\`),
        KEY \`idx_bs_timestamp\` (\`timestamp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`basis_snapshot\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`taker_volume_snapshot\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`funding_oi_snapshot\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`liquidation\``);
  }
}
