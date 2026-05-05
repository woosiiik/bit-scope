import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 알림 통화 구분 기능 마이그레이션
 *
 * - 기존 alert_history, alert 데이터 전체 삭제 (클린 스타트)
 * - alert 테이블에 currency varchar(10) NOT NULL 컬럼 추가
 * - alert 테이블의 exchange 컬럼을 NOT NULL로 변경
 */
export class AlertCurrencySupport1746500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 기존 데이터 삭제 (FK 제약 순서: alert_history → alert)
    await queryRunner.query(`DELETE FROM alert_history`);
    await queryRunner.query(`DELETE FROM alert`);

    // 2. currency 컬럼 추가 (NOT NULL)
    await queryRunner.query(
      `ALTER TABLE alert ADD COLUMN currency varchar(10) NOT NULL AFTER exchange`,
    );

    // 3. exchange 컬럼을 NOT NULL로 변경
    await queryRunner.query(
      `ALTER TABLE alert MODIFY COLUMN exchange varchar(20) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // exchange 컬럼을 nullable로 복원
    await queryRunner.query(
      `ALTER TABLE alert MODIFY COLUMN exchange varchar(20) NULL`,
    );

    // currency 컬럼 삭제
    await queryRunner.query(`ALTER TABLE alert DROP COLUMN currency`);
  }
}
