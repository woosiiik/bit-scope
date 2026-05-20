# Requirements Document: Breaking News (뉴스속보)

## Introduction

BitScope에 **"뉴스속보"** 기능을 추가한다. 이 기능은 기존 텔레그램 피드(인플루언서 분석 목적)와는 별개의 독립 메뉴로, 암호화폐 관련 속보를 거의 실시간으로 사용자에게 전달하는 것이 목적이다.

초기 데이터 소스는 `@Coin24Live` 텔레그램 채널이며, 추후 다른 텔레그램 채널, 웹 스크래핑, RSS 등 다양한 소스를 확장할 수 있는 아키텍처를 갖추어야 한다. 또한, 크립토 데스크(Life 페이지)의 분할뷰에서 위젯으로도 배치 가능해야 한다.

기존 텔레그램 채널 수집 인프라(`t.me/s/` HTML 파싱 방식)를 재활용하되, 수집 주기를 기존 10분에서 대폭 단축하여 속보성을 확보한다.

---

## Requirements

### Requirement 1: 사이드바 뉴스속보 메뉴

**User Story:** 사용자로서, 사이드바의 "News & Intel" 섹션에서 "뉴스속보" 메뉴를 클릭하여 속보 전용 페이지에 접근하고 싶다. 이를 통해 기존 텔레그램 피드(인플루언서 분석)와 구분된 속보를 빠르게 확인할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 사이드바를 볼 때 THEN 시스템은 "News & Intel" 섹션에 "뉴스속보" 메뉴 항목을 표시 SHALL.
2. WHEN 사용자가 "뉴스속보" 메뉴를 클릭할 때 THEN 시스템은 `/breaking-news` 경로의 속보 전용 페이지로 이동 SHALL.
3. WHERE 사이드바 네비게이션에서 "뉴스속보" 메뉴는 기존 "뉴스"와 "텔레그램 피드" 사이에 배치되어야 SHALL.
4. WHEN 사용자가 모바일 하단 탭 네비게이션을 사용할 때 THEN 시스템은 해당 메뉴에서도 "뉴스속보"에 접근 가능하도록 SHALL.
5. WHEN 사용자가 현재 `/breaking-news` 페이지에 있을 때 THEN 시스템은 사이드바에서 해당 메뉴를 활성(active) 상태로 표시 SHALL.

---

### Requirement 2: 속보 수집 백엔드 (데이터 파이프라인)

**User Story:** 시스템 운영자로서, `@Coin24Live` 텔레그램 채널의 메시지를 거의 실시간으로 자동 수집하고 싶다. 이를 통해 사용자에게 최신 속보를 지연 없이 제공할 수 있다.

#### Acceptance Criteria

1. WHEN 속보 수집 cron이 트리거될 때 THEN 시스템은 `@Coin24Live` 채널의 `t.me/s/Coin24Live` 웹 프리뷰를 파싱하여 최신 메시지를 수집 SHALL.
2. WHEN 속보 수집 주기가 도래할 때 THEN 시스템은 최대 1분 이내 간격으로 수집을 실행 SHALL. (기존 텔레그램 채널의 10분 간격과 독립적으로 운영)
3. IF 동일한 메시지가 이미 DB에 존재할 때 THEN 시스템은 중복 저장을 방지 SHALL. (originalUrl 또는 메시지 ID 기반 중복 체크)
4. WHEN 메시지를 저장할 때 THEN 시스템은 기존 `NewsArticleEntity`를 사용하되, `source` 필드를 `breaking-coin24live`와 같이 속보 전용 prefix로 구분 SHALL.
5. WHEN 수집 과정에서 네트워크 오류가 발생할 때 THEN 시스템은 오류를 로깅하고 다음 주기에 재시도 SHALL. 단일 실패가 전체 서비스에 영향을 주지 않아야 한다.
6. WHEN 속보 수집기가 초기화될 때 THEN 시스템은 수집 대상 채널 목록을 설정(configuration)에서 관리하여, 새 채널 추가 시 코드 변경을 최소화 SHALL.

---

### Requirement 3: 확장 가능한 소스 아키텍처

**User Story:** 개발자로서, 텔레그램 이외의 속보 소스(웹 스크래핑, RSS, API 등)를 쉽게 추가할 수 있는 구조를 원한다. 이를 통해 속보 채널을 확장할 때 기존 코드를 크게 수정하지 않아도 된다.

#### Acceptance Criteria

1. WHEN 새로운 속보 소스를 추가할 때 THEN 시스템은 공통 인터페이스(예: `BreakingNewsSourceInterface`)를 구현하는 방식으로 소스를 등록할 수 있어야 SHALL.
2. WHERE 속보 수집 서비스에서 각 소스는 독립적으로 수집 주기, 파싱 로직, 오류 처리를 가져야 SHALL.
3. WHEN 한 소스에서 수집 실패가 발생하더라도 THEN 시스템은 다른 소스의 수집에 영향을 주지 않아야 SHALL.
4. WHEN 속보 메시지를 저장할 때 THEN 시스템은 `source` 필드로 소스 유형을 식별할 수 있어야 SHALL. (예: `breaking-coin24live`, `breaking-scrape-xxx` 등)
5. IF 영어 소스가 추가되는 경우 THEN 시스템은 기존 AI 요약/번역 파이프라인을 활용하여 한국어 요약을 생성할 수 있어야 SHALL.

---

### Requirement 4: 뉴스속보 전용 페이지 (프론트엔드)

**User Story:** 사용자로서, 뉴스속보 페이지에서 최신 암호화폐 속보를 시간순으로 확인하고, 스크롤하여 과거 속보도 탐색하고 싶다.

#### Acceptance Criteria

1. WHEN 사용자가 뉴스속보 페이지에 접속할 때 THEN 시스템은 최신 속보를 시간 역순(최신 → 과거)으로 표시 SHALL.
2. WHEN 속보 목록이 표시될 때 THEN 각 속보 카드는 다음 정보를 포함 SHALL: 소스명, 속보 내용(제목/본문), 게시 시각(상대 시간, 예: "3분 전"), 원문 링크.
3. WHEN 사용자가 페이지 하단에 도달할 때 THEN 시스템은 cursor 기반 무한 스크롤로 이전 속보를 추가 로드 SHALL.
4. WHEN 페이지 데이터가 로딩 중일 때 THEN 시스템은 로딩 인디케이터를 표시 SHALL.
5. WHEN 데이터 로딩에 실패했을 때 THEN 시스템은 에러 메시지를 사용자에게 표시 SHALL.
6. WHEN 수집된 속보가 없을 때 THEN 시스템은 빈 상태(empty state) 안내 메시지를 표시 SHALL.
7. WHEN 사용자가 속보 카드의 원문 링크를 클릭할 때 THEN 시스템은 새 탭에서 텔레그램 원문을 열어야 SHALL.
8. WHILE 사용자가 뉴스속보 페이지에 머물러 있는 동안 THEN 시스템은 주기적으로(30초~60초 간격) 새 속보를 자동 갱신 SHALL.

---

### Requirement 5: 실시간 새 속보 알림 (페이지 내)

**User Story:** 사용자로서, 뉴스속보 페이지를 보고 있을 때 새 속보가 도착하면 즉시 알림을 받고 싶다. 이를 통해 속보를 놓치지 않을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 뉴스속보 페이지에 머무는 동안 새로운 속보가 수집되었을 때 THEN 시스템은 페이지 상단에 "N건의 새 속보가 있습니다" 알림 배너를 표시 SHALL.
2. WHEN 사용자가 새 속보 알림 배너를 클릭할 때 THEN 시스템은 목록 최상단으로 스크롤하고 새 속보를 목록에 추가 SHALL.
3. IF 사용자가 이미 목록 최상단에 있을 때 THEN 시스템은 새 속보를 자동으로 목록에 삽입 SHALL. (별도 알림 배너 불필요)

---

### Requirement 6: 크립토 데스크 위젯

**User Story:** 사용자로서, 크립토 데스크(Life 페이지)의 분할뷰에서 뉴스속보 위젯을 배치하여 다른 정보와 함께 속보를 한눈에 보고 싶다.

#### Acceptance Criteria

1. WHEN 사용자가 크립토 데스크 위젯 목록을 볼 때 THEN 시스템은 "뉴스속보" 위젯 타입을 선택 가능하게 표시 SHALL. (기존 `WIDGET_METAS`에 `breakingNews` 타입 추가)
2. WHEN 사용자가 크립토 데스크에 뉴스속보 위젯을 배치할 때 THEN 시스템은 위젯 영역 내에서 최신 속보를 컴팩트한 리스트 형태로 표시 SHALL.
3. WHILE 크립토 데스크가 활성 상태인 동안 THEN 뉴스속보 위젯은 주기적으로 새 속보를 자동 갱신 SHALL.
4. WHEN 위젯 내 속보 항목을 클릭할 때 THEN 시스템은 새 탭에서 원문을 열어야 SHALL.
5. WHERE 크립토 데스크 위젯에서 뉴스속보 위젯은 스크롤 가능한 컴팩트 뷰를 제공하여, 제한된 공간에서도 여러 속보를 확인할 수 있어야 SHALL.

---

### Requirement 7: 속보 데이터 API

**User Story:** 프론트엔드 개발자로서, 속보 데이터를 조회할 수 있는 API 엔드포인트가 필요하다. 이를 통해 속보 페이지와 위젯이 데이터를 가져올 수 있다.

#### Acceptance Criteria

1. WHEN 프론트엔드가 속보 목록을 요청할 때 THEN 시스템은 기존 뉴스 API에 `sourceType=breaking` 필터를 지원하여 속보만 조회할 수 있게 SHALL.
2. WHEN 속보 목록 API가 호출될 때 THEN 시스템은 cursor 기반 페이지네이션을 지원 SHALL. (기존 뉴스 API와 동일한 패턴)
3. WHEN 프론트엔드가 새 속보 존재 여부를 확인할 때 THEN 시스템은 특정 시각 이후의 속보 건수를 반환하는 엔드포인트(또는 파라미터)를 제공 SHALL.
4. WHEN API 응답을 반환할 때 THEN 시스템은 기존 `NewsArticle` 응답 형식과 동일한 구조를 사용 SHALL.

---

### Requirement 8: 다국어 지원

**User Story:** 사용자로서, 시스템의 언어 설정(한국어/영어)에 따라 뉴스속보 메뉴명과 UI 텍스트가 해당 언어로 표시되기를 원한다.

#### Acceptance Criteria

1. WHEN 시스템 언어가 한국어일 때 THEN 시스템은 메뉴명을 "뉴스속보"로 표시 SHALL.
2. WHEN 시스템 언어가 영어일 때 THEN 시스템은 메뉴명을 "Breaking News"로 표시 SHALL.
3. WHEN 뉴스속보 페이지의 UI 텍스트(헤더, 빈 상태 메시지, 버튼 등)를 표시할 때 THEN 시스템은 현재 언어 설정에 맞는 번역을 사용 SHALL.

---

### Requirement 9: 비기능 요구사항 - 성능

**User Story:** 사용자로서, 뉴스속보 페이지가 빠르게 로드되고 원활하게 스크롤되기를 원한다.

#### Acceptance Criteria

1. WHEN 뉴스속보 페이지를 최초 로드할 때 THEN 시스템은 최신 20건을 1초 이내에 표시 SHALL. (API 응답 시간 기준, 네트워크 지연 제외)
2. WHEN 속보 수집 cron이 실행될 때 THEN 시스템은 기존 뉴스 수집 cron(RSS, 텔레그램 인플루언서)의 성능에 영향을 주지 않아야 SHALL.
3. WHILE 속보 수집기가 실행 중일 때 THEN 시스템은 `t.me/s/` 요청에 적절한 타임아웃(15초 이내)과 rate limiting을 적용하여 텔레그램 서버에 과부하를 주지 않아야 SHALL.
4. WHEN 무한 스크롤로 추가 속보를 로드할 때 THEN 시스템은 추가 로드 시 기존 목록의 스크롤 위치를 유지 SHALL.

---

### Requirement 10: 비기능 요구사항 - 안정성 및 모니터링

**User Story:** 시스템 운영자로서, 속보 수집의 정상 동작 여부를 확인하고, 장애 시 빠르게 파악하고 싶다.

#### Acceptance Criteria

1. WHEN 속보 수집이 성공적으로 완료될 때 THEN 시스템은 수집 건수를 로그에 기록 SHALL.
2. WHEN 속보 수집에 실패할 때 THEN 시스템은 에러 레벨 로그를 기록 SHALL.
3. IF 속보 수집이 연속 3회 이상 실패할 때 THEN 시스템은 경고 레벨 로그를 기록 SHALL.
4. WHEN 오래된 속보를 정리할 때 THEN 시스템은 기존 뉴스 정리 정책(30일)과 동일한 보존 기간을 적용 SHALL.

---

### Requirement 11: 비기능 요구사항 - 데이터 보존 및 정리

**User Story:** 시스템 운영자로서, 속보 데이터가 무한히 쌓이지 않도록 자동 정리되기를 원한다.

#### Acceptance Criteria

1. WHEN 자동 정리 cron이 실행될 때 THEN 시스템은 30일 이상 된 속보 데이터를 자동 삭제 SHALL.
2. WHEN 속보 데이터가 삭제될 때 THEN 시스템은 삭제 건수를 로그에 기록 SHALL.
3. WHERE 속보 데이터 정리는 기존 뉴스 정리 cron(`news-cleanup`)과 통합하여 처리 SHALL. (별도 cron 불필요)
