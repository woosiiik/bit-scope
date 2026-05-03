# BitScope 데이터베이스 스키마

## 개요

MySQL 8.4 기반, TypeORM으로 관리. 개발 환경에서는 `synchronize: true`로 자동 생성.

---

## ER 다이어그램

```
portfolio_snapshot (1) ←── snapshot_holding (N)
       id                    snapshot_id (FK, CASCADE)

alert (1) ←── alert_history (N)
   id           alert_id (FK, CASCADE)

report              (독립)
report_schedule     (독립)
kimchi_premium_history (독립)
price_history       (독립)
```

---

## 테이블 상세

### 1. portfolio_snapshot — 포트폴리오 스냅샷

사용자가 대시보드에 접속할 때마다 자동으로 저장되는 포트폴리오 요약 데이터.
성과분석(시계열 차트)의 데이터 소스.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `wallet_address` | varchar(42) | 사용자 지갑 주소 (0x...) |
| `created_at` | timestamp | 스냅샷 생성 시각 |
| `total_evaluation` | decimal(20,4) | 총 평가금액 (KRW) |
| `total_investment` | decimal(20,4) | 총 투자금액 (KRW) |
| `total_profit_loss` | decimal(20,4) | 총 손익 (KRW) |
| `profit_loss_rate` | decimal(10,4) | 수익률 (%) |

**인덱스:**
- `idx_snapshot_wallet` — wallet_address
- `idx_snapshot_wallet_created` — (wallet_address, created_at)

**관계:** snapshot_holding (1:N, CASCADE)

---

### 2. snapshot_holding — 스냅샷 보유 코인 상세

포트폴리오 스냅샷 내 개별 코인 보유 내역.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `snapshot_id` | varchar(36) FK | portfolio_snapshot.id 참조 |
| `symbol` | varchar(20) | 코인 심볼 (BTC, ETH 등) |
| `exchange` | varchar(20) | 거래소 (upbit, bithumb, coinone) |
| `balance` | decimal(30,8) | 보유 수량 |
| `avg_buy_price` | decimal(20,4) | 매수 평균가 |
| `current_price` | decimal(20,4) | 스냅샷 시점 현재가 |
| `evaluation` | decimal(20,4) | 평가금액 (KRW) |

**인덱스:**
- `idx_holding_snapshot` — snapshot_id

**FK:** snapshot_id → portfolio_snapshot.id (ON DELETE CASCADE)

---

### 3. alert — 알림 설정

사용자가 설정한 가격/김프 알림 조건.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `wallet_address` | varchar(42) | 사용자 지갑 주소 |
| `symbol` | varchar(20) | 코인 심볼 |
| `exchange` | varchar(20) NULL | 대상 거래소 (null=전체) |
| `condition` | varchar(20) | 조건 (above, below, premium_above, premium_below) |
| `target_value` | decimal(20,4) | 목표 가격 또는 프리미엄(%) |
| `is_active` | boolean | 활성 상태 (기본: true) |
| `created_at` | timestamp | 생성 일시 |
| `updated_at` | timestamp | 수정 일시 |

**인덱스:**
- `idx_alert_wallet` — wallet_address
- `idx_alert_wallet_active` — (wallet_address, is_active)

**관계:** alert_history (1:N, CASCADE)

---

### 4. alert_history — 알림 발생 이력

알림 조건이 충족되어 발생한 이력.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `alert_id` | varchar(36) FK | alert.id 참조 |
| `triggered_at` | timestamp | 알림 발생 시각 |
| `triggered_value` | decimal(20,4) | 발생 시점의 가격/프리미엄 값 |
| `message` | varchar(500) | 알림 메시지 |

**인덱스:**
- `idx_alert_history_alert` — alert_id
- `idx_alert_history_triggered` — triggered_at

**FK:** alert_id → alert.id (ON DELETE CASCADE)

---

### 5. report — 리포트

수동/자동 생성된 포트폴리오 리포트.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `wallet_address` | varchar(42) | 사용자 지갑 주소 |
| `type` | varchar(20) | 리포트 유형 (daily, weekly, monthly, custom) |
| `generated_at` | timestamp | 리포트 생성 일시 |
| `period_start` | timestamp | 리포트 기간 시작 |
| `period_end` | timestamp | 리포트 기간 종료 |
| `summary` | json | 리포트 요약 데이터 |
| `data` | json | 리포트 시점의 스냅샷 데이터 |

**인덱스:**
- `idx_report_wallet` — wallet_address
- `idx_report_wallet_generated` — (wallet_address, generated_at)

---

### 6. report_schedule — 정기 리포트 스케줄

NestJS cron이 참조하는 자동 리포트 스케줄.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `wallet_address` | varchar(42) | 사용자 지갑 주소 |
| `type` | varchar(20) | 리포트 유형 (daily, weekly, monthly) |
| `is_active` | boolean | 활성 상태 (기본: true) |
| `next_run_at` | timestamp | 다음 실행 예정 시각 |
| `cron_expression` | varchar(50) | cron 표현식 (예: "0 9 * * *") |
| `created_at` | timestamp | 생성 일시 |
| `updated_at` | timestamp | 수정 일시 |

**인덱스:**
- `idx_schedule_wallet` — wallet_address
- `idx_schedule_active_next` — (is_active, next_run_at)

---

### 7. kimchi_premium_history — 김치 프리미엄 이력

국내 거래소 vs 바이낸스 시세 차이(김프) 이력. NestJS가 1분 간격으로 자동 기록.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `symbol` | varchar(20) | 코인 심볼 |
| `domestic_exchange` | varchar(20) | 비교 기준 국내 거래소 |
| `domestic_price` | decimal(20,4) | 국내 거래소 KRW 가격 |
| `binance_usdt_price` | decimal(20,8) | 바이낸스 USDT 가격 |
| `usdt_krw_rate` | decimal(20,4) | USDT/KRW 환율 |
| `premium_rate` | decimal(10,4) | 김프 비율 (%) |
| `recorded_at` | timestamp | 기록 시각 |

**인덱스:**
- `idx_premium_symbol_exchange_recorded` — (symbol, domestic_exchange, recorded_at)

---

### 8. price_history — 가격 이력

거래소별 코인 가격 이력. 시계열 분석 및 차트용.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) PK | UUID |
| `symbol` | varchar(20) | 코인 심볼 |
| `exchange` | varchar(20) | 거래소 식별자 |
| `price` | decimal(20,4) | 가격 |
| `volume_24h` | decimal(30,8) | 24시간 거래량 |
| `recorded_at` | timestamp | 기록 시각 |

**인덱스:**
- `idx_price_symbol_exchange_recorded` — (symbol, exchange, recorded_at)
- `idx_price_recorded` — recorded_at

---

## 데이터 축적 방식

| 테이블 | 축적 주체 | 주기 |
|--------|-----------|------|
| portfolio_snapshot + snapshot_holding | 클라이언트 (대시보드 접속 시) | 사용자 접속마다 |
| alert + alert_history | NestJS (시세 모니터링) | 실시간 |
| report | 사용자 수동 요청 또는 NestJS cron | 수동 / 일간·주간·월간 |
| report_schedule | 사용자 설정 | - |
| kimchi_premium_history | NestJS cron | 1분 간격 |
| price_history | NestJS (미사용, 향후 활용) | - |
