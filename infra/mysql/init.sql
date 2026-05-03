-- =============================================================================
-- BitScope MySQL 초기화 스크립트
--
-- Docker Compose로 최초 실행 시 자동으로 실행되는 초기 데이터베이스 설정.
-- bitscope 데이터베이스를 생성하고 문자셋을 UTF-8로 설정한다.
-- =============================================================================

-- 데이터베이스가 없으면 생성 (UTF-8 전체 유니코드 지원)
CREATE DATABASE IF NOT EXISTS `bitscope`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- bitscope 사용자에게 데이터베이스 권한 부여
GRANT ALL PRIVILEGES ON `bitscope`.* TO 'bitscope'@'%';
FLUSH PRIVILEGES;
