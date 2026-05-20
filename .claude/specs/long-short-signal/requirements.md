# 롱/숏 시그널 (Long/Short Signal) 요구사항 문서

## 소개

BitScope에 **히든 메뉴 "롱/숏 시그널"** 기능을 추가한다. 이 기능은 Telegram Private 채널에서 수신되는 암호화폐 롱/숏 시그널 메시지를 자동 수집하고, 파싱하여 DB에 저장한 뒤, 인증된 사용자에게만 보이는 히든 메뉴를 통해 시그널 리스트를 표시한다.

일반 사용자에게는 노출되지 않으며, 사이드바 버전 텍스트를 5번 빠르게 클릭하고 비밀번호를 입력해야만 접근할 수 있다. Phase 1에서는 시그널 리스트 조회만 구현하며, 차트 연동이나 자동 매매는 이후 단계에서 다룬다.

---

## 요구사항

### 요구사항 1: 히든 메뉴 접근 메커니즘 (버전 텍스트 클릭)

**User Story:** 관리자로서, 사이드바의 버전 텍스트를 5번 빠르게 클릭하여 히든 메뉴에 접근하고 싶다. 그래야 일반 사용자에게 노출하지 않으면서 시그널 기능을 사용할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 사이드바 좌하단의 버전 텍스트(예: "v0.1.0")를 2초 이내에 5번 클릭 THEN 시스템 SHALL 비밀번호 입력 모달을 화면에 표시한다.
2. IF 클릭 간격이 2초를 초과하면 THEN 시스템 SHALL 클릭 카운트를 0으로 초기화한다.
3. WHEN 비밀번호 입력 모달이 표시된 상태에서 사용자가 모달 외부를 클릭하거나 ESC를 누르면 THEN 시스템 SHALL 모달을 닫고 클릭 카운트를 초기화한다.
4. WHEN 비밀번호 입력 모달이 표시된 상태 THEN 시스템 SHALL 비밀번호 입력 필드와 확인/취소 버튼을 제공한다.
5. WHILE 히든 메뉴가 활성화되지 않은 상태 THEN 시스템 SHALL 버전 텍스트에 시각적으로 어떠한 힌트도 표시하지 않아야 한다 (일반 텍스트와 동일한 외관 유지).

---

### 요구사항 2: 히든 메뉴 비밀번호 인증

**User Story:** 관리자로서, 비밀번호를 입력하여 히든 메뉴에 인증하고 싶다. 그래야 권한이 없는 사용자의 접근을 차단할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 올바른 비밀번호를 입력하고 확인 버튼을 클릭 THEN 시스템 SHALL 인증 성공을 처리하고 히든 메뉴를 사이드바에 노출한다.
2. WHEN 사용자가 틀린 비밀번호를 입력하고 확인 버튼을 클릭 THEN 시스템 SHALL "비밀번호가 올바르지 않습니다" 에러 메시지를 모달 내에 표시한다.
3. IF 비밀번호 인증에 성공한 상태 THEN 시스템 SHALL 해당 브라우저 세션이 유지되는 동안 인증 상태를 유지한다 (sessionStorage 활용).
4. WHEN 브라우저 탭을 닫거나 세션이 종료되면 THEN 시스템 SHALL 인증 상태를 자동으로 해제한다.
5. WHEN 비밀번호 검증 요청을 서버에 보낼 때 THEN 시스템 SHALL 비밀번호를 평문으로 전송하지 않고 해시 또는 안전한 방식으로 비교한다.
6. WHEN 인증 성공 후 사이드바에 히든 메뉴가 노출될 때 THEN 시스템 SHALL "롱/숏 시그널" 메뉴 항목을 기존 섹션과 구분되는 위치에 표시한다.

---

### 요구사항 3: 시스템 설정 테이블 (`t_system_config`)

**User Story:** 시스템 운영자로서, 히든 메뉴 비밀번호, Telegram API 인증 정보 등 보안 민감 설정을 DB에서 안전하게 관리하고 싶다. 그래야 환경변수 외에도 런타임에 설정을 변경할 수 있다.

#### Acceptance Criteria

1. WHEN 시스템이 초기화될 때 THEN 시스템 SHALL `t_system_config` 테이블이 존재하지 않으면 자동으로 생성한다 (TypeORM 마이그레이션 또는 synchronize).
2. WHERE `t_system_config` 테이블 THEN 시스템 SHALL 다음 컬럼을 포함한다: `id` (PK, auto increment), `config_key` (VARCHAR, UNIQUE), `config_value` (TEXT), `is_sensitive` (BOOLEAN, default false), `description` (VARCHAR, nullable), `created_at` (DATETIME), `updated_at` (DATETIME).
3. IF `is_sensitive` 플래그가 true인 설정 값 THEN 시스템 SHALL 해당 값을 암호화하여 DB에 저장하고, 읽을 때 복호화한다.
4. WHEN 시스템이 처음 구동될 때 THEN 시스템 SHALL 다음 기본 설정 키를 시드(seed) 데이터로 등록한다: `hidden_menu_password`, `telegram_api_id`, `telegram_api_hash`, `telegram_signal_channel_id`.
5. WHEN API를 통해 `t_system_config`의 민감한 값을 조회할 때 THEN 시스템 SHALL 값을 마스킹하여 반환한다 (예: `****`). 복호화된 원본 값은 서버 내부 로직에서만 사용한다.
6. WHEN `config_key`가 중복으로 삽입되려 할 때 THEN 시스템 SHALL UNIQUE 제약에 의해 삽입을 거부하고 에러를 반환한다.

---

### 요구사항 4: Telegram User API (MTProto) 연동 및 세션 관리

**User Story:** 시스템 운영자로서, Telegram Private 채널의 시그널 메시지를 서버에서 자동 수집하고 싶다. 그래야 수동으로 메시지를 확인하지 않아도 된다.

#### Acceptance Criteria

1. WHEN NestJS 백엔드 서비스가 시작될 때 THEN 시스템 SHALL `t_system_config`에서 `telegram_api_id`, `telegram_api_hash` 값을 읽어 Telegram MTProto 클라이언트를 초기화한다.
2. IF Telegram 세션 파일이 서버에 존재하지 않으면 THEN 시스템 SHALL 최초 1회 전화번호 인증 프로세스를 시작할 수 있는 수단(CLI 또는 관리 API)을 제공한다.
3. IF Telegram 세션 파일이 서버에 이미 존재하면 THEN 시스템 SHALL 세션 파일을 사용하여 자동으로 Telegram에 로그인한다.
4. WHEN Telegram 클라이언트가 연결된 상태 THEN 시스템 SHALL `telegram_signal_channel_id`에 해당하는 채널의 새 메시지를 실시간으로 수신한다.
5. IF Telegram 연결이 끊어지면 THEN 시스템 SHALL 자동으로 재연결을 시도하고, 재연결 시도 간격을 지수 백오프(exponential backoff)로 증가시킨다.
6. WHEN Telegram 클라이언트가 메시지를 수신할 때 THEN 시스템 SHALL 수신한 원본 메시지 텍스트, 메시지 ID, 수신 시각을 로그로 기록한다.
7. WHERE Telegram 세션 파일 THEN 시스템 SHALL 세션 파일을 서버의 안전한 경로에 저장하고, 파일 권한을 제한한다.
8. WHEN `telegram_api_id` 또는 `telegram_api_hash` 값이 `t_system_config`에 설정되지 않았거나 비어 있으면 THEN 시스템 SHALL Telegram 클라이언트 초기화를 건너뛰고 경고 로그를 출력한다.

---

### 요구사항 5: 시그널 메시지 파싱 및 저장

**User Story:** 시스템으로서, 수신된 Telegram 메시지를 자동으로 파싱하여 코인별 시그널 데이터를 구조화하고 싶다. 그래야 프론트엔드에서 정리된 시그널 리스트를 표시할 수 있다.

#### Acceptance Criteria

1. WHEN Telegram 채널에서 새 메시지가 수신되면 THEN 시스템 SHALL 메시지를 파싱하여 다음 정보를 추출한다: 시그널 방향(LONG/SHORT), 시그널 타입(L1, L2, L3, LL, L, RL, S1, S2, S3, SS, S), 코인 심볼(예: BTC/USDT), 섹션명(예: "Premium Pro Alert", "Smart Pro Alert").
2. WHEN 파싱된 시그널 데이터를 저장할 때 THEN 시스템 SHALL 시그널 저장 테이블(`t_signal`)에 다음 컬럼으로 저장한다: `id` (PK), `coin_symbol` (VARCHAR), `direction` (ENUM: LONG, SHORT), `signal_type` (VARCHAR), `section_name` (VARCHAR, nullable), `telegram_message_id` (BIGINT), `signal_at` (DATETIME, 메시지 수신 시각), `raw_message` (TEXT, 원본 메시지), `created_at` (DATETIME).
3. WHEN 하나의 Telegram 메시지에 여러 섹션과 여러 코인이 포함되어 있으면 THEN 시스템 SHALL 각 코인별로 개별 시그널 레코드를 생성한다.
4. IF 동일한 `telegram_message_id`의 메시지가 이미 DB에 존재하면 THEN 시스템 SHALL 중복 저장하지 않고 건너뛴다.
5. WHEN 메시지 형식이 예상 패턴과 일치하지 않으면 THEN 시스템 SHALL 파싱 실패 로그를 남기고, 원본 메시지는 별도 로그 또는 테이블에 기록하여 추후 분석할 수 있게 한다.
6. WHEN `Long [L1, L2, L3]` 형식의 시그널을 파싱할 때 THEN 시스템 SHALL 시그널 타입을 "L1,L2,L3"으로 저장하고 방향을 LONG으로 설정한다.
7. WHEN `Short [S1, S2, S3]` 형식의 시그널을 파싱할 때 THEN 시스템 SHALL 시그널 타입을 "S1,S2,S3"으로 저장하고 방향을 SHORT으로 설정한다.
8. WHEN `Double Long [LL]` 형식의 시그널을 파싱할 때 THEN 시스템 SHALL 시그널 타입을 "LL"로 저장하고 방향을 LONG으로 설정한다.
9. WHEN `Double Short [SS]` 형식의 시그널을 파싱할 때 THEN 시스템 SHALL 시그널 타입을 "SS"로 저장하고 방향을 SHORT으로 설정한다.
10. WHEN `Ready Long [RL]` 형식의 시그널을 파싱할 때 THEN 시스템 SHALL 시그널 타입을 "RL"로 저장하고 방향을 LONG으로 설정한다.
11. WHEN `Long [L]` 또는 `Short [S]` 형식의 시그널을 파싱할 때 THEN 시스템 SHALL 각각 시그널 타입을 "L" 또는 "S"로 저장하고 방향을 LONG 또는 SHORT으로 설정한다.

---

### 요구사항 6: 시그널 조회 API

**User Story:** 프론트엔드 개발자로서, 인증된 사용자가 시그널 리스트를 조회할 수 있는 API가 필요하다. 그래야 히든 메뉴 페이지에서 시그널 데이터를 표시할 수 있다.

#### Acceptance Criteria

1. WHEN 인증된 사용자가 시그널 리스트 API를 호출하면 THEN 시스템 SHALL 최신 시그널부터 시간순으로 정렬된 시그널 목록을 반환한다.
2. WHEN 시그널 리스트 API를 호출할 때 THEN 시스템 SHALL 각 시그널에 대해 `coin_symbol`, `direction`, `signal_type`, `section_name`, `signal_at` 정보를 포함하여 반환한다.
3. IF API 요청에 히든 메뉴 인증 토큰이 포함되지 않거나 유효하지 않으면 THEN 시스템 SHALL 403 Forbidden 응답을 반환한다.
4. WHEN 시그널 리스트 API를 호출할 때 THEN 시스템 SHALL 페이지네이션을 지원한다 (기본 페이지 크기: 50).
5. WHEN 코인별 최신 시그널 상태를 조회하는 API를 호출하면 THEN 시스템 SHALL 각 코인의 가장 최근 시그널(방향, 타입, 시각)만 반환한다 (코인별 중복 제거, 최신 1건).

---

### 요구사항 7: 프론트엔드 히든 메뉴 페이지 (Phase 1)

**User Story:** 관리자로서, 히든 메뉴에 진입하여 코인별 시그널 리스트를 한눈에 확인하고 싶다. 그래야 현재 시장의 롱/숏 방향성을 빠르게 파악할 수 있다.

#### Acceptance Criteria

1. WHEN 인증된 사용자가 사이드바의 "롱/숏 시그널" 메뉴를 클릭하면 THEN 시스템 SHALL 시그널 리스트 페이지(`/signal` 또는 유사 경로)를 렌더링한다.
2. WHEN 시그널 리스트 페이지가 로딩될 때 THEN 시스템 SHALL 코인별 최신 시그널 상태를 테이블 또는 카드 형식으로 표시한다.
3. WHERE 시그널 리스트의 각 항목 THEN 시스템 SHALL 다음 정보를 표시한다: 코인 심볼(예: BTC/USDT), 현재 방향(LONG 또는 SHORT), 시그널 타입(L1, L2, L3, LL, L, RL, S1, S2, S3, SS, S), 시그널 도착 시간.
4. WHEN 시그널 방향이 LONG일 때 THEN 시스템 SHALL 해당 항목을 초록색 계열(상승)으로 표시한다.
5. WHEN 시그널 방향이 SHORT일 때 THEN 시스템 SHALL 해당 항목을 빨간색 계열(하락)으로 표시한다.
6. WHEN 시그널 리스트가 표시될 때 THEN 시스템 SHALL 기본적으로 시간순(최신 시그널이 상단) 정렬을 적용한다.
7. IF 인증되지 않은 사용자가 시그널 페이지 URL에 직접 접근하면 THEN 시스템 SHALL 페이지 내용을 표시하지 않고 메인 페이지로 리다이렉트한다.
8. WHEN 시그널 리스트 페이지가 표시된 상태에서 새로운 시그널이 수신되면 THEN 시스템 SHALL 주기적 폴링(예: 30초 간격) 또는 WebSocket을 통해 리스트를 자동 갱신한다.
9. WHEN 시그널 데이터가 없을 때 THEN 시스템 SHALL "수신된 시그널이 없습니다" 빈 상태 메시지를 표시한다.

---

### 요구사항 8: 보안 및 비기능 요구사항

**User Story:** 시스템 운영자로서, 히든 메뉴 기능이 보안적으로 안전하고 안정적으로 운영되길 원한다. 그래야 민감한 시그널 데이터와 인증 정보가 노출되지 않는다.

#### Acceptance Criteria

1. WHEN `t_system_config`에 민감한 값(is_sensitive=true)을 저장할 때 THEN 시스템 SHALL AES-256 또는 동등한 수준의 암호화 알고리즘을 사용하여 값을 암호화한다.
2. WHEN Telegram API credentials를 사용할 때 THEN 시스템 SHALL credentials를 서버 측에서만 처리하고, 프론트엔드에 절대 노출하지 않는다.
3. WHEN 히든 메뉴 비밀번호 검증 API를 호출할 때 THEN 시스템 SHALL rate limiting을 적용한다 (예: 동일 IP에서 1분당 최대 5회).
4. WHEN 시그널 데이터를 프론트엔드로 전달할 때 THEN 시스템 SHALL Next.js Route Handler를 프록시로 사용하여 백엔드 API URL이 브라우저에 직접 노출되지 않도록 한다.
5. WHERE Telegram 세션 파일 THEN 시스템 SHALL 해당 파일을 `.gitignore`에 포함하여 버전 관리에서 제외한다.
6. WHEN 시스템이 비정상 종료 후 재시작될 때 THEN 시스템 SHALL Telegram 세션을 자동으로 복구하고 시그널 수집을 재개한다.
7. WHEN 시그널 파싱 또는 Telegram 연결에 오류가 발생할 때 THEN 시스템 SHALL 오류 로그를 기록하되 전체 서비스의 안정성에 영향을 미치지 않아야 한다 (장애 격리).
8. WHEN 히든 메뉴 관련 API 엔드포인트가 호출될 때 THEN 시스템 SHALL 해당 요청과 응답을 일반 API 로그와 동일한 수준으로 기록한다.

---

## 범위 외 (Out of Scope - Phase 1)

다음 기능은 Phase 1 범위에 포함되지 않으며, 추후 단계에서 구현한다:

- 시그널 기반 차트 연동 (코인 차트에 시그널 시점 마킹)
- 자동 매매 (시그널에 따른 자동 주문 실행)
- 시그널 통계 및 분석 (승률, 수익률 등)
- 시그널 알림 (푸시 알림, Telegram 봇 리포워딩)
- 관리자 UI를 통한 `t_system_config` 편집 (Phase 1에서는 직접 DB 또는 시드로 관리)
- 여러 Telegram 채널 동시 수집
- 시그널 이력 필터링/검색 UI (Phase 1은 단순 시간순 리스트만)
