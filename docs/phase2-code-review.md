# Phase 2 서버사이드 데이터 수집 코드 리뷰

> 리뷰일: 2026-05-28
> 대상 커밋: `59a36a9` ~ `85af02d` (4개 커밋)
> 기준 문서: [Velo Market 페이지 조사](./velo-market-page-research.md) (섹션 3.3~3.5, 2.7)
> 리뷰 방식: 4개 영역 병렬 리뷰 (NestJS 수집기, 쿼리 서비스/Route Handler, 프론트 차트/훅, DB 스키마/엔티티)

---

## 1. 리뷰 요약

| 심각도 | 건수 | 설명 |
|--------|------|------|
| **P0 (치명적)** | 4건 | 데이터 정확도 심각한 왜곡, OOM 위험 |
| **P1 (중요)** | 8건 | 에러 처리, 인덱스, 쿼리 정합성 |
| **P2 (아키텍처)** | 6건 | 설계, 확장성, 코드 중복 |
| **P3 (UX/개선)** | 7건 | 프론트 UX, 포맷, 스켈레톤 |
| **합계** | **25건** | |

---

## 2. P0 - 치명적 버그

### P0-1. Binance OI가 항상 0 → OI 가중 평균에서 최대 거래소 제외

**파일**: `funding-oi-collector.service.ts:141`

```typescript
openInterest: 0, // premiumIndex에 OI 없음
```

Binance `premiumIndex` API에 OI가 포함되지 않아 항상 0으로 DB에 저장됨. OI 가중 평균 펀딩 계산에서 Binance(세계 최대 거래소)의 펀딩비율이 **완전히 무시**됨.

영향 범위:
- **Funding Heatmap**: Binance 펀딩이 가중 평균에서 제외
- **OI Changes**: 전체 OI에서 Binance가 빠져 시장 규모 과소평가
- **Normalized CVD**: 분모(Total OI)에서 Binance가 빠져 CVD 값 과대평가

---

### P0-2. OKX OI가 코인 단위로 저장 — 다른 거래소는 USD 단위

**파일**: `funding-oi-collector.service.ts:191`

```typescript
if (sym) oiMap.set(sym, safeFloat(item.oiCcy));  // 코인 수량 단위
```

다른 거래소는 `openInterest * price`로 USD 환산하여 저장하지만, OKX만 `oiCcy`(코인 수량 단위)를 그대로 저장. 예: BTC 68,000달러일 때 OKX는 `1`, Bybit는 `68,000`으로 저장.

**결과**: OI 가중 평균에서 OKX 가중치가 비정상적으로 작아짐. 거래소 간 OI 비교도 의미 없음.

---

### P0-3. FundingHeatmapService 1개월 조회 시 70만+ 행 메모리 로드 — OOM 위험

**파일**: `funding-heatmap.service.ts:28-31`

```typescript
const rows = await this.repo.find({
  where: { timestamp: MoreThan(since) },
  order: { timestamp: 'ASC' },
});
```

`1m` 기간 요청 시 약 720,000행(250코인 × 6거래소 × 720시간)을 **전부 메모리에 로드**한 후 애플리케이션에서 상위 30개 심볼 필터링. 행당 ~100바이트 = **약 70MB**. Node.js 힙 압박 → OOM 가능.

**수정 방향**: 2단계 쿼리 — (1) 상위 30개 심볼을 DB에서 먼저 추출, (2) 해당 심볼만 조회

---

### P0-4. OKX funding-rate 벌크 조회 불가 가능성

**파일**: `funding-oi-collector.service.ts:172`

```typescript
fetch('https://www.okx.com/api/v5/public/funding-rate', ...)
```

OKX 공식 문서에 따르면 `/api/v5/public/funding-rate`는 `instId` 파라미터가 **필수**. 파라미터 없이 벌크 호출 시 에러 반환 가능. 만약 현재 동작한다면 undocumented behavior에 의존하는 것이므로 언제든 깨질 수 있음.

---

## 3. P1 - 중요 버그

### P1-1. NestJS 컨트롤러 에러 시 HTTP 200 반환 + Route Handler에서 에러 응답 캐싱

**파일**: `phase2.controller.ts:23-27`, Route Handler 4개

```typescript
catch (err) {
  return { success: false, error: { message: '...' } };  // HTTP 200으로 반환
}
```

에러 시에도 HTTP 200이므로 Route Handler의 `res.ok`가 true → 에러 응답이 60초간 캐싱됨. 이후 60초간 실제 데이터가 복구되어도 캐시된 에러가 반환됨.

**수정**: NestJS에서 `HttpException` throw, 또는 Route Handler에서 `data.success` 체크 후 캐싱 스킵

---

### P1-2. `timestamp` 단독 인덱스 부재 — 주요 쿼리에서 풀 테이블 스캔

**파일**: 3개 엔티티 모두

현재 인덱스: `(symbol, timestamp)`, `(exchange, timestamp)` 복합 인덱스만 존재. 그러나 주요 쿼리들은 `WHERE timestamp > X`만 사용:
- `FundingHeatmapService`: `WHERE timestamp > since`
- `OIChangesService`: `SELECT MAX(timestamp) FROM ...`
- `NormalizedCVDService`: `SELECT MAX(timestamp) FROM ...`
- `DataCleanupService`: `DELETE WHERE timestamp < cutoff`

복합 인덱스의 두 번째 컬럼(`timestamp`)만으로는 인덱스 사용 불가 (B-tree leftmost prefix 규칙).

**수정**: 각 엔티티에 `@Index('idx_xxx_timestamp', ['timestamp'])` 추가

---

### P1-3. OI Changes/CVD의 MAX(timestamp) 서브쿼리가 거래소별 시차 무시

**파일**: `oi-changes.service.ts:30-32`, `normalized-cvd.service.ts:42-43`

```sql
WHERE s.timestamp = (SELECT MAX(s2.timestamp) FROM funding_oi_snapshot s2)
```

전체 테이블의 단일 MAX timestamp를 사용. 거래소별 수집 시점이 다르면 일부 거래소 데이터가 해당 시점에 없어 OI가 과소평가됨.

**수정**: `GROUP BY symbol, exchange`로 각 거래소의 최신 행을 개별 조회

---

### P1-4. Funding Heatmap의 동일 버킷 내 details 덮어쓰기

**파일**: `funding-heatmap.service.ts:57`

```typescript
cell.details.set(r.exchange, { rate, oi });
```

동일 시간 버킷에 같은 거래소 행이 여러 개 있으면(예: 4시간 버킷에 1시간마다 4개 행), `details` Map이 마지막 값으로 덮어씀. `totalWeighted`/`totalOI`에는 모든 행이 누적되어 가중 평균과 details가 불일치.

---

### P1-5. OI Changes가 시계열이 아닌 단일 스냅샷만 반환

**파일**: `oi-changes.service.ts`

리서치 문서 3.3은 "OI 누적 변화율을 **시계열로** 보여주는 차트"를 설명하지만, 현재는 baseline vs current의 단일 변화율만 반환. 시간 축이 없어 시계열 라인 차트에 사용 불가.

---

### P1-6. CVD가 시계열이 아닌 단일 집계값

**파일**: `normalized-cvd.service.ts`

리서치 문서 3.5에서 CVD는 "시간에 따른 누적 추이"가 핵심인데, 전체 기간의 SUM을 단일 값으로 반환. 시계열 차트에 필요한 시간 버킷별 누적합이 없음.

---

### P1-7. Route Handler URL 파라미터 인젝션

**파일**: `basis/route.ts:20` (및 다른 Route Handler)

```typescript
const url = `${API_BASE}/phase2/basis?symbol=${symbol}&period=${period}`;
```

사용자 입력(`searchParams`)을 URL 인코딩 없이 직접 삽입. `symbol=BTC&extra=hack` 같은 값으로 추가 파라미터 주입 가능.

**수정**: `encodeURIComponent()` 또는 `URL` 객체 + `searchParams.set()` 사용

---

### P1-8. `useBasis` 훅에 `enabled` 옵션 없음 — 불필요한 API 호출

**파일**: `useBasis.ts`, `chart-grid.tsx:199`

BTC/ETH만 Basis 데이터가 존재하는데, 모든 코인에서 `useBasis(coin, ...)`가 호출됨. SOL, DOGE 등 지원하지 않는 코인에서도 API 호출 발생.

**수정**: `enabled: ['BTC', 'ETH'].includes(symbol)` 추가

---

## 4. P2 - 아키텍처/성능

### P2-1. Phase 2 DB 마이그레이션 파일 없음

**파일**: `database.config.ts:64`

프로덕션에서 `synchronize`가 기본 `false`이므로 Phase 2 테이블이 자동 생성되지 않음. 마이그레이션 파일 작성 또는 배포 절차 정의 필요.

---

### P2-2. CVD가 Binance 단일 거래소에만 의존 + 분자/분모 범위 불일치

**파일**: `taker-volume-collector.service.ts`, `normalized-cvd.service.ts:56`

CVD는 Binance의 taker 데이터만 사용하고, OI는 Binance OI가 0인 상태의 5개 거래소 합산. 분자(Binance CVD)와 분모(5개 거래소 OI)의 범위가 불일치하여 실제보다 작은 Normalized CVD 값이 산출됨.

---

### P2-3. TakerVolume 초기 수집 타이밍 불안정

**파일**: `taker-volume-collector.service.ts:46-48`

```typescript
setTimeout(() => this.collect(), 5000);
```

FundingOI 수집 완료를 5초 `setTimeout`으로 대기. FundingOI가 5초 안에 안 끝나면 `getBinanceSymbols()`가 빈 배열 → 해당 사이클 전체 스킵, 1시간 후까지 데이터 없음.

---

### P2-4. 4개 Route Handler + 4개 훅 보일러플레이트 중복

**파일**: Route Handler 4개, 훅 4개

동일한 패턴(캐시 확인 → fetch → 캐시 저장 → stale fallback)이 8개 파일에 반복. 팩토리 함수로 통합 가능.

---

### P2-5. `safeFloat` / `floorHour` 유틸리티 3곳 중복 정의

**파일**: `funding-oi-collector.service.ts`, `taker-volume-collector.service.ts`, `basis-collector.service.ts`

동일한 함수가 3개 파일에 복사. 공유 유틸리티로 추출 권장.

---

### P2-6. `taker_volume_snapshot`에 `exchange` 컬럼 부재

**파일**: `taker-volume-snapshot.entity.ts`

현재 Binance 단독이라 문제없지만, 향후 다른 거래소 추가 시 스키마 변경 필요. 확장성을 위해 미리 추가 권장.

---

## 5. P3 - UX/개선

### P3-1. Funding Heatmap/CVD 차트에 로딩 스켈레톤 없음

**파일**: `page.tsx:274, 283`

Phase 1 차트들은 `ChartSkeleton`을 보여주지만, Phase 2 차트는 조건 없이 바로 렌더링. 로딩 중 "데이터 수집 중입니다" 메시지가 표시되어 동작은 하지만 다른 차트와 UX 불일치.

---

### P3-2. FundingHeatmapChart `grid` 반환 타입 불일치 + 반복 `as` 캐스팅

**파일**: `funding-heatmap-chart.tsx:34, 48, 61, 68, 82-83`

`useMemo`에서 데이터 없으면 `grid: []`(배열), 있으면 `grid: { syms, times, cellMap }`(객체) 반환. 이후 `as { times: number[] }` 등으로 반복 캐스팅. 타입 안전성 없음.

---

### P3-3. OI Changes / CVD 서버 데이터 정렬 미보장

**파일**: `oi-changes-chart.tsx:25`, `normalized-cvd-chart.tsx:15`

서버에서 반환되는 데이터의 정렬 순서가 보장되지 않는데, 프론트에서 `slice(0, 20)`만 하고 정렬 없이 표시. 변화가 큰 코인 순이 아닌 임의 순서 가능.

---

### P3-4. Normalized CVD X축과 Tooltip 소수점 불일치

**파일**: `normalized-cvd-chart.tsx:32, 36`

X축 `toFixed(3)`, Tooltip `toFixed(4)`. 값이 매우 작으면(0.0001) X축에 `0.000`으로 표시. 통일 또는 동적 조정 필요.

---

### P3-5. Basis3mChart의 미사용 `data: unknown` prop

**파일**: `basis3m-chart.tsx:14`

이전 placeholder 구현의 잔재. 현재 `serverData`만 사용하고 `data`는 컴포넌트 내에서 참조하지 않음. 제거 권장.

---

### P3-6. Basis 연환산에서 만기일 근접 시 극단값

**파일**: `basis.service.ts:38-40`

`daysToExpiry`가 매우 작은 양수(0.01일)일 때 `365 / 0.01 = 36,500`으로 연환산 Basis가 극단적 증폭. 최소 `daysToExpiry` 임계값(예: 1일) 설정 권장.

---

### P3-7. Controller `period` 파라미터 유효성 미검증

**파일**: `phase2.controller.ts:19, 29, 39, 52`

유효하지 않은 period 값이 서비스까지 전달되어 `PERIOD_HOURS`에서 `undefined` → 기본값 24시간으로 fallback. 명시적 400 에러 반환이 바람직.

---

## 6. 계산 로직 정합성 검증

| 계산 | 공식 | 리서치 문서 일치 | 구현 정확도 |
|------|------|:-:|:-:|
| **OI 가중 펀딩** | `Σ(funding × OI) / Σ(OI)` | O | △ (Binance OI=0, OKX 단위 불일치) |
| **OI 변화율** | `(current - baseline) / baseline × 100` | O | △ (시계열 미반환) |
| **Normalized CVD** | `CVD / Total OI` | O | △ (분자/분모 범위 불일치) |
| **Basis 연환산** | `(futures - spot) / spot × 365/days × 100` | O | O |

수학적 공식은 모두 리서치 문서와 정확히 일치하나, 입력 데이터 품질 문제(Binance OI=0, OKX 단위)로 결과 정확도가 저하됨.

---

## 7. DB 스토리지 추정 (90일 retention)

| 테이블 | 행/시간 | 행/일 | 90일 누적 | 용량 (인덱스 포함) |
|--------|---------|-------|-----------|-------------------|
| `funding_oi_snapshot` | ~1,000 | ~24,000 | ~2,160,000 | ~200-300MB |
| `taker_volume_snapshot` | ~50 | ~1,200 | ~108,000 | ~10MB |
| `basis_snapshot` | ~2 | ~48 | ~4,320 | <1MB |
| **합계** | | | **~2,270,000** | **~300MB** |

`funding_oi_snapshot`이 전체의 95%+. OCI ARM VM 환경에서 관리 가능한 수준이나 모니터링 필요.

---

## 8. 수정 우선순위

### 즉시 수정 (P0)

1. **Binance OI 별도 수집** — `/fapi/v1/openInterest` 상위 50개 코인 병렬 호출 추가
2. **OKX OI 단위 통일** — `oiCcy` 대신 `oiCcy * markPrice` 또는 적절한 USD 환산
3. **FundingHeatmapService 쿼리 최적화** — 2단계 쿼리로 메모리 사용량 제한
4. **OKX funding-rate 벌크 호출 가능 여부 검증** — 불가 시 개별 심볼 호출로 전환

### 단기 수정 (P1)

5. `timestamp` 단독 인덱스 3개 테이블에 추가
6. NestJS 컨트롤러 에러 시 HTTP 500 반환 + Route Handler 에러 응답 캐싱 방지
7. MAX(timestamp) 서브쿼리를 거래소별 최신 행 조회로 변경
8. Route Handler URL 파라미터 인코딩
9. `useBasis` 훅 `enabled` 옵션 추가
10. OI Changes/CVD 시계열 반환 검토

### 중기 개선 (P2-P3)

11. Phase 2 마이그레이션 파일 작성
12. Route Handler/훅 팩토리 패턴 통합
13. 차트 로딩 스켈레톤 통일
14. Funding Heatmap details 덮어쓰기 수정

---

## 9. 잘 된 부분

- **Funding Heatmap을 커스텀 SVG로 구현** — Recharts에 네이티브 히트맵이 없어 올바른 판단
- **`Promise.allSettled` + 부분 장애 허용** — 일부 거래소 실패 시 나머지로 서비스 유지
- **`ExchangeBackoffManager`** — 지수 백오프 + 연속 실패 카운팅 패턴 적절
- **`floorHour` + UPSERT** — 중복 방지와 최신 데이터 유지의 균형 잘 맞음
- **`DataCleanupService` 새벽 3시 실행** — 서비스 영향 최소화
- **Basis 연환산 계산** — 리서치 문서와 정확히 일치, 만기일 갱신 로직도 양호
- **TanStack Query 설정** — `staleTime: 60s, refetchInterval: 300s`가 서버 수집 주기와 적절히 매칭

---

## 10. 리뷰 범위 파일 목록

**NestJS 수집기:**
- `apps/api/src/modules/phase2/phase2.module.ts`
- `apps/api/src/modules/phase2/phase2.controller.ts`
- `apps/api/src/modules/phase2/funding-oi-collector.service.ts`
- `apps/api/src/modules/phase2/taker-volume-collector.service.ts`
- `apps/api/src/modules/phase2/basis-collector.service.ts`
- `apps/api/src/modules/phase2/exchange-backoff-manager.ts`
- `apps/api/src/modules/phase2/symbol-normalizer.ts`
- `apps/api/src/modules/phase2/data-cleanup.service.ts`

**NestJS 쿼리 서비스:**
- `apps/api/src/modules/phase2/funding-heatmap.service.ts`
- `apps/api/src/modules/phase2/oi-changes.service.ts`
- `apps/api/src/modules/phase2/normalized-cvd.service.ts`
- `apps/api/src/modules/phase2/basis.service.ts`

**TypeORM 엔티티:**
- `apps/api/src/modules/phase2/entities/funding-oi-snapshot.entity.ts`
- `apps/api/src/modules/phase2/entities/taker-volume-snapshot.entity.ts`
- `apps/api/src/modules/phase2/entities/basis-snapshot.entity.ts`

**Next.js Route Handler:**
- `apps/web/app/api/futures-dashboard/funding-heatmap/route.ts`
- `apps/web/app/api/futures-dashboard/oi-changes/route.ts`
- `apps/web/app/api/futures-dashboard/normalized-cvd/route.ts`
- `apps/web/app/api/futures-dashboard/basis/route.ts`

**프론트 차트/훅:**
- `apps/web/app/(dashboard)/market-screener/components/charts/funding-heatmap-chart.tsx`
- `apps/web/app/(dashboard)/market-screener/components/charts/oi-changes-chart.tsx`
- `apps/web/app/(dashboard)/market-screener/components/charts/normalized-cvd-chart.tsx`
- `apps/web/app/(dashboard)/futures-dashboard/components/charts/basis3m-chart.tsx`
- `apps/web/hooks/useFundingHeatmap.ts`
- `apps/web/hooks/useOIChanges.ts`
- `apps/web/hooks/useNormalizedCVD.ts`
- `apps/web/hooks/useBasis.ts`
