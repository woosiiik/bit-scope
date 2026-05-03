# CLAUDE.md

## 프로젝트 개요
BitScope - 한국 암호화폐 거래소(업비트, 빗썸, 코인원) 포트폴리오 통합 조회 웹 서비스.

## 기술 스택 및 인프라
- 프론트엔드: Next.js 15 (App Router), React 19, TypeScript
- 상태 관리: Zustand, TanStack Query
- UI: Tailwind CSS, shadcn/ui, Recharts
- Web3: wagmi v2, viem, RainbowKit
- 암호화: crypto-js (AES-256)
- 백엔드: NestJS 10, TypeORM, Socket.IO
- 데이터베이스: MySQL
- 모노레포: Turborepo, pnpm
- 인프라: OCI ARM VM, Docker Compose, nginx, GitHub Actions

## 프로젝트 구조
- 모노레포 구조 (apps/, packages/)
- `apps/web` - Next.js 프론트엔드 + CORS 프록시 (Route Handler)
- `apps/api` - NestJS 백그라운드 서비스 (WebSocket 시세, DB, 알림, cron)
- `packages/shared` - 공유 타입, 유틸리티, 상수

## 보안 아키텍처
- API Key는 절대 브라우저 밖으로 전송하지 않음
- 클라이언트에서 거래소별 서명 (업비트: JWT, 빗썸: JWT, 코인원: HMAC-SHA512)
- Next.js Route Handler가 서명된 요청을 거래소에 릴레이
- Web3 지갑(MetaMask) 서명 기반 API Key 암호화 → localStorage 저장
- 모든 데이터는 지갑 주소별 분리 저장 (bitscope:{addr}:*)

## 기능 개발 워크플로우
- 새 기능 개발 요청 시 자동으로 Spec 워크플로우를 시작할 것
- 워크플로우 시작: `spec-system-prompt-loader` 에이전트 호출 → 반환된 경로의 `spec-workflow-starter.md`를 읽고 워크플로우 지시사항을 따를 것
- 워크플로우 순서: Requirements → Design → Tasks → Implementation (각 단계마다 사용자 승인 필요)
- 중간 산출물(requirements.md, design.md, tasks.md)은 `.claude/specs/` 에 저장
- 단순 버그 수정, 리팩토링, 설정 변경 등은 워크플로우 없이 바로 처리

## 응답 언어
- 한국어로 답변

## 코딩 원칙

### 워크어라운드 금지
- 문제가 발생하면 근본 원인을 찾아서 수정할 것. 워크어라운드(우회 해결)로 돌리지 않는다.
- 특히 개발 초기에는 절대 워크어라운드 금지. 기능이 안정적으로 동작하는 상태가 되기 전까지는 항상 근본적인 방법으로 해결한다.
- 워크어라운드가 허용되는 예외 상황:
  - 근본 수정이 현재 잘 돌아가는 시스템 전체를 망칠 위험이 있을 때
  - 외부 라이브러리 버그 등 근본 수정이 불가능할 때
- 예외 상황에 해당하더라도 워크어라운드를 적용하기 전에 사용자에게 이유를 설명하고 동의를 구할 것

### 디버깅 방법
- 문제를 계속 못 풀 때는 추측으로 코드를 수정하지 말고, 로그를 추가하여 사용자에게 로그 확인을 요청할 것
- 로그 기반으로 근본 원인을 파악한 후에 수정한다
