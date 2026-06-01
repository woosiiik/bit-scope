# Requirements Document

## Introduction

주식/선물(perp) 비교 메뉴(`stock-perp-comparison`)의 비교 차트 렌더러를 현재의 recharts 기반(`ComposedChart`)에서 TradingView의 오픈소스 라이브러리인 lightweight-charts(MIT 라이선스)로 교체한다.

목적은 두 가지다. 첫째, 차트를 금융 차트답게 더 보기 좋게 만든다(crosshair, 줌/팬, 부드러운 라인). 둘째, 분봉 데이터를 더 촘촘하게(부드럽게) 보여준다. 현재 차트는 `MAX_POINTS=100` 다운샘플링 때문에 라인이 듬성듬성하고 각져 보인다.

이 작업은 **렌더러(차트 컴포넌트) 교체에 한정**한다. 데이터 파이프라인(`merge-timeline.ts`), Route Handler, `useStockPerpComparison.ts` 훅, `ComparisonPoint` 타입은 변경하지 않는다. 차트가 소비하는 입력(`ComparisonPoint[]`)과 컴포넌트 외부 인터페이스(props)는 그대로 유지한 채 내부 렌더링만 lightweight-charts로 전환한다.

본 문서는 요구사항을 두 갈래로 명확히 구분한다.
- **기능 동등성(Parity)**: 현재 recharts 차트가 제공하던 기능을 lightweight-charts에서 동일하게 재현하는 요구사항.
- **추가 개선(Enhancement)**: lightweight-charts 전환을 계기로 새로 추가하거나 향상되는 요구사항.

### 범위 밖(Out of Scope)
- `merge-timeline.ts`, Route Handler, `useStockPerpComparison.ts` 훅, `ComparisonPoint` 타입, Yahoo/Hyperliquid/환율 데이터 소스의 변경.
- 좌우 분리 Y축 또는 % 정규화로의 표현 방식 변경(단일 KRW Y축 오버레이 유지).
- 차트 외 페이지 레이아웃/페어 선택/range 선택 UI의 변경.

---

## Requirements

### Requirement 1: 렌더러 라이브러리 교체

**User Story:** 개발자로서, 비교 차트의 렌더링 엔진을 recharts에서 lightweight-charts로 교체하여, 금융 차트다운 시각 품질과 대량 포인트 렌더 성능을 확보하고 싶다.

#### Acceptance Criteria

1. WHEN 비교 차트 컴포넌트가 렌더링될 때 THEN 시스템 SHALL recharts 대신 lightweight-charts(TradingView 오픈소스, MIT) 라이브러리를 사용하여 차트를 그린다.
2. WHEN 차트 컴포넌트가 데이터를 받을 때 THEN 시스템 SHALL 기존과 동일하게 `ComparisonPoint[]`(`@bitscope/shared`)를 입력으로 사용하며 입력 데이터 형식을 변경하지 않는다.
3. THE 시스템 SHALL `merge-timeline.ts` 데이터 파이프라인, Route Handler, `useStockPerpComparison.ts` 훅, `ComparisonPoint` 타입을 변경하지 않는다.
4. THE 시스템 SHALL 차트 컴포넌트의 외부 props 인터페이스(`points`, `stockLabel`, `perpLabel`, `baseCurrency`)를 호환 가능하게 유지한다.
5. WHEN 컴포넌트가 마운트 해제(unmount)될 때 THEN 시스템 SHALL lightweight-charts 인스턴스와 관련 리소스를 정리(dispose)하여 메모리 누수를 방지한다.
6. THE 시스템 SHALL `'use client'` 클라이언트 컴포넌트로서 SSR 환경에서 안전하게 동작한다(서버 렌더 시 차트 라이브러리 접근 오류가 발생하지 않는다).

---

### Requirement 2: 두 시리즈 단일 KRW Y축 오버레이 (Parity)

**User Story:** 사용자로서, 주식(KRW)과 perp(KRW 환산) 두 가격을 동일한 KRW 축 위에 겹쳐 보고 싶다. 그래야 두 가격의 절대적 괴리를 한눈에 비교할 수 있다.

#### Acceptance Criteria

1. WHEN 차트가 렌더링될 때 THEN 시스템 SHALL 주식 가격(`stockPrice`, KRW)과 perp 가격(`perpPrice`, KRW 환산) 두 라인 시리즈를 표시한다.
2. THE 시스템 SHALL 두 시리즈를 좌우 분리 축이나 % 정규화가 아닌 **단일 KRW Y축**에 오버레이하여 표시한다.
3. THE 시스템 SHALL 주식 라인과 perp 라인을 서로 다른 색상으로 구분하여 표시한다.
4. THE 시스템 SHALL 어떤 시리즈가 주식이고 어떤 시리즈가 perp인지 식별할 수 있는 범례(legend) 또는 동등한 라벨 표기를 `stockLabel`/`perpLabel`을 사용해 제공한다.
5. WHERE Y축에 THE 시스템 SHALL 가격 값을 한국어 숫자 포맷(천 단위 구분)으로 표기한다.
6. THE 시스템 SHALL Y축이 KRW 단위임을 식별할 수 있는 표기(단위 라벨 또는 가격 포맷)를 제공한다.

---

### Requirement 3: 주식 라인 휴장 구간 끊김 / perp 라인 연속 (Parity)

**User Story:** 사용자로서, 주식 라인은 장이 닫힌 구간에서 끊기고 perp 라인은 24시간 연속으로 이어지길 원한다. 그래야 거래가 없던 시간과 perp 단독 변동 구간을 구분할 수 있다.

#### Acceptance Criteria

1. WHEN `stockPrice`가 `null`인(휴장 결측) 구간이 있을 때 THEN 시스템 SHALL 주식 라인을 해당 구간에서 끊어 표시한다(recharts `connectNulls={false}` 동등 동작 — 결측 구간을 가로질러 잇지 않는다).
2. WHEN `perpPrice`에 부분 결측이 있을 때 THEN 시스템 SHALL perp 라인을 24시간 연속으로 이어 표시한다(recharts `connectNulls` 동등 동작).
3. THE 시스템 SHALL `ComparisonPoint`의 `null` 가격을 lightweight-charts 데이터 모델에 맞게 매핑하되, 휴장 결측을 forward-fill로 채우지 않는다(데이터 무결성 유지, R3.1과 충돌 금지).
4. THE 시스템 SHALL 두 시리즈가 동일한 시간 그리드(공통 `timestamp`) 위에 정렬되어 표시되도록 보장한다.

---

### Requirement 4: 휴장 구간 음영 표시 및 토글 (Parity)

**User Story:** 사용자로서, 주식 장이 닫힌 연속 구간을 음영으로 보고 싶고, 필요하면 켜고 끌 수 있길 원한다. 그래야 시각적 노이즈를 조절할 수 있다.

#### Acceptance Criteria

1. WHEN `marketOpen === false`인 포인트가 연속될 때 THEN 시스템 SHALL 해당 시간 구간을 음영(shaded region)으로 표시한다.
2. THE 시스템 SHALL 연속 휴장 구간을 `{ x1, x2 }` 단위로 묶어, 인접하지 않은 여러 휴장 구간을 각각 별도 음영으로 렌더한다(현재 `computeClosedRegions` 동등 동작).
3. THE 시스템 SHALL 휴장 음영을 켜고 끄는 토글 컨트롤을 제공하며 기본값은 ON으로 한다.
4. WHEN 사용자가 토글을 OFF로 전환할 때 THEN 시스템 SHALL 모든 휴장 음영을 즉시 숨긴다.
5. WHEN 사용자가 토글을 다시 ON으로 전환할 때 THEN 시스템 SHALL 휴장 음영을 즉시 다시 표시한다.
6. THE 토글 컨트롤 SHALL 현재 상태(ON/OFF)를 시각적으로 그리고 `aria-pressed` 등 접근성 속성으로 표시한다.
7. THE 음영 영역 SHALL 가격 라인을 가리지 않도록 라인 아래 레이어 또는 반투명으로 렌더한다.

---

### Requirement 5: KST 시간축 및 스마트 포맷 (Parity)

**User Story:** 사용자로서, 시간축이 한국 시간(KST) 기준으로 표시되고 선택한 range에 따라 적절한 시간 단위로 보이길 원한다. 그래야 한국 거래 시간을 직관적으로 읽을 수 있다.

#### Acceptance Criteria

1. THE 시스템 SHALL 시간축을 KST(`Asia/Seoul`) 기준으로 포맷하여 표시한다.
2. WHEN 표시 구간이 48시간 미만일 때 THEN 시스템 SHALL 시각(시:분, 24시간제)을 기준으로 시간축 라벨을 포맷한다.
3. WHEN 표시 구간이 48시간 이상 14일 미만일 때 THEN 시스템 SHALL 월/일 + 시 단위로 시간축 라벨을 포맷한다.
4. WHEN 표시 구간이 14일 이상일 때 THEN 시스템 SHALL 월/일 단위로 시간축 라벨을 포맷한다.
5. THE 시스템 SHALL `ComparisonPoint.timestamp`(UTC epoch ms)를 lightweight-charts 시간 모델로 변환할 때 KST 표시가 어긋나지 않도록 처리한다.

---

### Requirement 6: 괴리(divergence) 정보 표시 (Parity)

**User Story:** 사용자로서, 차트의 특정 시점에 마우스를 올리면 그 시점의 주식가, perp가, 적용 환율, 두 가격의 괴리를 보고 싶다. 그래야 김치 프리미엄/디스카운트를 정확히 읽을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 차트의 한 시점에 마우스를 올릴 때 THEN 시스템 SHALL 해당 시점의 정보를 표시하는 패널/툴팁을 보여준다.
2. THE 정보 패널 SHALL 해당 시점을 KST 날짜·시각으로 표시한다.
3. THE 정보 패널 SHALL 주식가(KRW)를 한국어 통화 포맷으로 표시하며, 결측 시 안전하게 처리한다(`—` 또는 동등 표기).
4. THE 정보 패널 SHALL perp가를 KRW 환산값과 원본 USD(`perpPriceRaw`)를 함께 표시하며, 결측 시 안전하게 처리한다.
5. THE 정보 패널 SHALL 적용 환율(`appliedRate`, USD/KRW)을 표시하며, 결측 시 안전하게 처리한다.
6. WHEN 주식가와 perp가가 모두 유효할 때 THEN 시스템 SHALL 괴리를 절대값(KRW, `perpPrice − stockPrice`)과 백분율(`(perpPrice/stockPrice − 1) × 100%`)로 표시하고, 부호에 따라 양/음을 색상으로 구분한다.
7. WHEN 주식가 또는 perp가가 결측일 때 THEN 시스템 SHALL 괴리를 `—`(데이터 없음)으로 표시하고 오류 없이 동작한다.
8. THE 시스템 SHALL 기존 통화 포맷 유틸(`formatAlertPrice` 등 `@bitscope/shared`)을 재사용하여 표기 일관성을 유지한다.

---

### Requirement 7: 테마 및 색상 톤 정합 (Parity + Enhancement)

**User Story:** 사용자로서, 차트가 다크/라이트 테마와 앱의 색상 톤에 자연스럽게 어울리길 원한다. 그래야 화면 전체가 일관돼 보인다.

#### Acceptance Criteria

1. THE 시스템 SHALL 차트의 배경, 그리드, 축, 텍스트, 음영 색상을 기존 CSS 변수(`var(--border)`, `var(--muted)`, `var(--muted-foreground)`, `var(--popover)` 등) 색상 톤에 맞춘다.
2. WHEN 다크/라이트 테마가 전환될 때 THEN 시스템 SHALL 차트 색상을 해당 테마에 맞게 반영한다.
3. THE 주식/perp 라인 색상 SHALL 두 테마 모두에서 서로 구분 가능하고 가독성이 유지되도록 한다.
4. THE 시스템 SHALL 차트 배경을 투명 또는 앱 배경과 동일한 톤으로 처리하여 컨테이너와 이질감이 없도록 한다.

---

### Requirement 8: 분봉 데이터 촘촘하게 렌더 (Enhancement)

**User Story:** 사용자로서, 분봉 데이터를 더 촘촘하고 부드러운 라인으로 보고 싶다. 현재처럼 100개로 강하게 다운샘플되어 각져 보이지 않길 원한다.

#### Acceptance Criteria

1. THE 시스템 SHALL 현재의 `MAX_POINTS=100` 강한 다운샘플링을 완화하여 더 많은 데이터 포인트를 렌더한다.
2. WHEN `ComparisonPoint[]`가 수백~수천 포인트일 때 THEN 시스템 SHALL 가시적인 프레임 끊김 없이 라인을 렌더한다(lightweight-charts의 대량 포인트 처리 활용).
3. THE 시스템 SHALL 다운샘플링을 적용하는 경우라도 휴장 갭(`stockGap`) 시작점과 `marketOpen` 전환 경계 포인트를 보존하여 라인 끊김·음영 경계가 어긋나지 않도록 한다(현재 `downsamplePreservingBoundaries` 경계 보존 정책 유지).
4. WHEN range가 단기(1d/5d 등 분봉)일 때 THEN 시스템 SHALL 가능한 한 원본 분봉 해상도에 가깝게 표시하여 라인이 부드럽게 보이도록 한다.
5. THE 다운샘플링 완화 또는 제거 SHALL 컴포넌트 입력 데이터(`ComparisonPoint[]`)의 생성 파이프라인을 변경하지 않고 렌더러 내부에서만 이루어진다.

---

### Requirement 9: Crosshair 및 호버 값 표시 (Enhancement)

**User Story:** 사용자로서, 차트 위에서 마우스를 움직일 때 십자선(crosshair)과 함께 해당 시점/가격이 표시되길 원한다. 그래야 TradingView처럼 정밀하게 값을 읽을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 차트 영역 위로 마우스를 움직일 때 THEN 시스템 SHALL crosshair(수직·수평 십자선)를 표시한다.
2. WHEN crosshair가 활성화될 때 THEN 시스템 SHALL 마우스 위치에 대응하는 시간(시간축)과 가격(가격축) 값을 표시한다.
3. THE crosshair 위치 시점 SHALL Requirement 6의 괴리 정보 패널과 동일한 시점을 가리키도록 동기화된다.
4. WHEN 마우스가 차트 영역을 벗어날 때 THEN 시스템 SHALL crosshair와 호버 값 표시를 숨긴다.

---

### Requirement 10: 줌/팬 인터랙션 (Enhancement)

**User Story:** 사용자로서, 차트를 줌인/줌아웃하고 좌우로 팬(스크롤)하며 특정 구간을 자세히 보고 싶다. 그래야 분봉 구간을 확대해 정밀하게 분석할 수 있다.

#### Acceptance Criteria

1. THE 시스템 SHALL lightweight-charts가 기본 제공하는 시간축 줌/팬 인터랙션을 활성화한다.
2. WHEN 사용자가 줌 또는 팬을 수행할 때 THEN 시스템 SHALL 두 시리즈, 휴장 음영, crosshair, 시간축 라벨을 변경된 표시 구간에 일관되게 갱신한다.
3. WHEN 사용자가 표시 구간을 변경할 때 THEN 시스템 SHALL Requirement 5의 스마트 시간 포맷을 변경된 구간 폭에 맞게 적용한다.
4. THE 시스템 SHALL 초기 로드 시 전체 데이터 구간이 한눈에 보이도록(fit content) 초기 표시 범위를 설정한다.

---

### Requirement 11: 빈/오류/로딩 상태 처리 (Parity)

**User Story:** 사용자로서, 데이터가 없거나 일부만 있을 때 차트가 깨지지 않고 안전하게 동작하길 원한다.

#### Acceptance Criteria

1. WHEN `points`가 비어 있거나 배열이 아닐 때 THEN 시스템 SHALL 차트 렌더를 생략하거나 빈 상태를 안전하게 표시하고 오류를 던지지 않는다.
2. WHEN 한 시리즈만 데이터가 있을 때(예: perp만 있고 주식은 전부 결측) THEN 시스템 SHALL 가용한 시리즈만 표시하고 정상 동작한다.
3. WHEN 페어 또는 range 전환으로 데이터가 갱신될 때 THEN 시스템 SHALL 이전 차트 상태를 정리하고 새 데이터로 갱신하며, 잔상이나 누수가 남지 않도록 한다.

---

### Requirement 12: 반응형 레이아웃 (Parity)

**User Story:** 사용자로서, 차트가 컨테이너 크기에 맞춰 채워지고 창 크기가 바뀌어도 적절히 리사이즈되길 원한다.

#### Acceptance Criteria

1. THE 시스템 SHALL 차트를 부모 컨테이너의 너비·높이에 맞게 채운다(현재 `ResponsiveContainer width="100%" height="100%"` 동등 동작).
2. WHEN 부모 컨테이너 또는 브라우저 창 크기가 변경될 때 THEN 시스템 SHALL 차트 크기를 갱신된 컨테이너 크기에 맞게 리사이즈한다.
3. WHEN 컴포넌트가 마운트 해제될 때 THEN 시스템 SHALL 리사이즈 옵저버/리스너를 해제한다.

---

## Non-Functional Requirements

### NFR1: 성능
1. THE 시스템 SHALL 수천 포인트 분봉 데이터를 초기 렌더 시 가시적 지연 없이 그린다.
2. THE 시스템 SHALL 페어/range 전환, 줌/팬 시 부드러운 인터랙션(체감 끊김 없음)을 유지한다.

### NFR2: 라이선스 및 의존성
1. THE 시스템 SHALL lightweight-charts(MIT 라이선스) 의존성을 `apps/web`에 추가하며 라이선스 호환성을 보장한다.
2. THE 시스템 SHALL recharts 의존성이 비교 차트 외 다른 화면에서 여전히 사용 중인지 확인하고, 비교 차트 한정 교체임을 명확히 한다(recharts 전역 제거는 본 작업 범위 밖).

### NFR3: 코드 품질 및 타입 안전성
1. THE 시스템 SHALL `noUncheckedIndexedAccess` 등 기존 TypeScript 엄격 설정을 준수한다.
2. THE 시스템 SHALL 기존 컴포넌트 파일 구조(차트 컴포넌트 + 보조 유틸/툴팁)와 일관된 형태로 작성하며, 재사용 가능한 순수 함수(경계 보존 다운샘플러, 휴장 구간 계산)는 단위 테스트 가능하게 분리 유지한다.

### NFR4: 국제화
1. THE 시스템 SHALL 사용자 표시 텍스트를 한국어로 표기하며 기존 i18n/숫자·통화 포맷 관례를 따른다.
