/**
 * 텔레그램 연결 정보 테이블 추가 마이그레이션
 *
 * 사용자 지갑 주소와 텔레그램 채팅 ID를 매핑하는
 * telegram_connection 테이블을 생성한다.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramConnection1746100000000 implements MigrationInterface {
  name = 'AddTelegramConnection1746100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`telegram_connection\` (
        \`id\` varchar(36) NOT NULL,
        \`wallet_address\` varchar(42) NOT NULL,
        \`chat_id\` varchar(50) NOT NULL,
        \`username\` varchar(100) NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`idx_telegram_wallet\` (\`wallet_address\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`telegram_connection\``);
  }
}
