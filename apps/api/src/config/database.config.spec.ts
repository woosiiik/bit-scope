/**
 * 데이터베이스 설정 단위 테스트
 *
 * 환경 변수에 따른 데이터베이스 설정 반환을 검증한다.
 */

import { getDatabaseConfig, ENTITIES } from './database.config';

describe('getDatabaseConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('기본값으로 로컬 개발 환경 설정을 반환해야 한다', () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USERNAME;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_DATABASE;

    const config = getDatabaseConfig() as Record<string, unknown>;

    expect(config.type).toBe('mysql');
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(3306);
    expect(config.username).toBe('bitscope');
    expect(config.password).toBe('bitscope');
    expect(config.database).toBe('bitscope');
  });

  it('환경 변수를 통해 설정을 오버라이드할 수 있어야 한다', () => {
    process.env.DB_HOST = 'production-host';
    process.env.DB_PORT = '3307';
    process.env.DB_USERNAME = 'prod_user';
    process.env.DB_PASSWORD = 'prod_pass';
    process.env.DB_DATABASE = 'prod_db';

    const config = getDatabaseConfig() as Record<string, unknown>;

    expect(config.host).toBe('production-host');
    expect(config.port).toBe(3307);
    expect(config.username).toBe('prod_user');
    expect(config.password).toBe('prod_pass');
    expect(config.database).toBe('prod_db');
  });

  it('프로덕션 환경에서는 synchronize가 비활성화되어야 한다', () => {
    process.env.NODE_ENV = 'production';

    const config = getDatabaseConfig() as Record<string, unknown>;

    expect(config.synchronize).toBe(false);
  });

  it('개발 환경에서는 synchronize가 활성화되어야 한다', () => {
    process.env.NODE_ENV = 'development';

    const config = getDatabaseConfig() as Record<string, unknown>;

    expect(config.synchronize).toBe(true);
  });

  it('타임존이 KST(+09:00)로 설정되어야 한다', () => {
    const config = getDatabaseConfig() as Record<string, unknown>;

    expect(config.timezone).toBe('+09:00');
  });

  it('재시도 설정이 올바르게 구성되어야 한다', () => {
    const config = getDatabaseConfig();

    expect(config.retryAttempts).toBe(3);
    expect(config.retryDelay).toBe(3000);
  });
});

describe('ENTITIES', () => {
  it('9개의 엔티티가 등록되어야 한다', () => {
    expect(ENTITIES).toHaveLength(9);
  });

  it('모든 엔티티가 클래스(함수)여야 한다', () => {
    ENTITIES.forEach((entity) => {
      expect(typeof entity).toBe('function');
    });
  });
});
