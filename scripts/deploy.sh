#!/usr/bin/env bash
# =============================================================================
# BitScope OCI VM 배포 스크립트
#
# OCI Always Free Tier VM(ARM)에 Docker Compose로 서비스를 배포한다.
# GitHub Actions에서 자동 호출되거나, 수동으로 실행할 수 있다.
#
# 사용법:
#   ./scripts/deploy.sh                # 전체 배포 (빌드 + 재시작)
#   ./scripts/deploy.sh --web-only     # 프론트엔드(web)만 배포
#   ./scripts/deploy.sh --api-only     # 백엔드(api)만 배포
#   ./scripts/deploy.sh --no-build     # 빌드 없이 재시작만
#   ./scripts/deploy.sh --rollback     # 이전 버전으로 롤백
#
# 환경 변수:
#   DEPLOY_PATH - 배포 경로 (기본: /home/opc/bitscope)
#
# 요구사항: NF2.4, NF6.4
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------------
DEPLOY_PATH="${DEPLOY_PATH:-/home/opc/bitscope}"
LOG_FILE="${DEPLOY_PATH}/deploy.log"
BACKUP_DIR="${DEPLOY_PATH}/backups"
HEALTH_CHECK_TIMEOUT=120  # 초
HEALTH_CHECK_INTERVAL=5   # 초

# 색상 코드 (터미널 출력용)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# 유틸리티 함수
# ---------------------------------------------------------------------------

log() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${GREEN}[${timestamp}]${NC} $1"
  echo "[${timestamp}] $1" >> "${LOG_FILE}" 2>/dev/null || true
}

warn() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${YELLOW}[${timestamp}] WARNING:${NC} $1"
  echo "[${timestamp}] WARNING: $1" >> "${LOG_FILE}" 2>/dev/null || true
}

error() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${RED}[${timestamp}] ERROR:${NC} $1" >&2
  echo "[${timestamp}] ERROR: $1" >> "${LOG_FILE}" 2>/dev/null || true
}

# 사전 조건 검증
check_prerequisites() {
  log "사전 조건 검증 중..."

  # Docker 설치 확인
  if ! command -v docker &> /dev/null; then
    error "Docker가 설치되어 있지 않습니다."
    exit 1
  fi

  # Docker Compose 확인
  if ! docker compose version &> /dev/null; then
    error "Docker Compose가 설치되어 있지 않습니다."
    exit 1
  fi

  # 배포 디렉토리 확인
  if [ ! -d "${DEPLOY_PATH}" ]; then
    error "배포 디렉토리가 존재하지 않습니다: ${DEPLOY_PATH}"
    error "먼저 리포지토리를 클론해주세요: git clone <repo> ${DEPLOY_PATH}"
    exit 1
  fi

  # .env 파일 확인
  if [ ! -f "${DEPLOY_PATH}/.env" ]; then
    warn ".env 파일이 없습니다. .env.example에서 복사합니다."
    cp "${DEPLOY_PATH}/.env.example" "${DEPLOY_PATH}/.env"
    warn ".env 파일을 환경에 맞게 수정해야 합니다."
  fi

  log "사전 조건 검증 완료"
}

# 현재 상태 백업
backup_current_state() {
  log "현재 상태 백업 중..."

  mkdir -p "${BACKUP_DIR}"

  local backup_name
  backup_name="backup-$(date '+%Y%m%d-%H%M%S')"
  local backup_path="${BACKUP_DIR}/${backup_name}"

  # 현재 커밋 해시 저장
  cd "${DEPLOY_PATH}"
  git rev-parse HEAD > "${backup_path}.commit" 2>/dev/null || true

  # 현재 Docker 이미지 태그 저장
  docker compose ps --format '{{.Image}}' > "${backup_path}.images" 2>/dev/null || true

  # 오래된 백업 정리 (최근 5개만 유지)
  ls -t "${BACKUP_DIR}"/backup-*.commit 2>/dev/null | tail -n +6 | while read -r old_backup; do
    local base_name="${old_backup%.commit}"
    rm -f "${base_name}.commit" "${base_name}.images"
  done

  log "백업 완료: ${backup_name}"
  echo "${backup_name}"
}

# 최신 코드 풀
pull_latest() {
  log "최신 코드 pull 중..."
  cd "${DEPLOY_PATH}"

  git fetch origin main
  git reset --hard origin/main

  log "코드 업데이트 완료: $(git rev-parse --short HEAD)"
}

# Docker 이미지 빌드
build_images() {
  local target="$1"
  cd "${DEPLOY_PATH}"

  case "${target}" in
    "web")
      log "프론트엔드(web) Docker 이미지 빌드 중..."
      docker compose build --no-cache web
      ;;
    "api")
      log "백엔드(api) Docker 이미지 빌드 중..."
      docker compose build --no-cache api
      ;;
    "all")
      log "전체 Docker 이미지 빌드 중..."
      docker compose build --no-cache web api
      ;;
    *)
      error "알 수 없는 빌드 타겟: ${target}"
      exit 1
      ;;
  esac

  log "Docker 이미지 빌드 완료"
}

# 서비스 재시작
restart_services() {
  local target="$1"
  cd "${DEPLOY_PATH}"

  case "${target}" in
    "web")
      log "프론트엔드(web) 서비스 재시작 중..."
      docker compose up -d web
      ;;
    "api")
      log "백엔드(api) 서비스 재시작 중..."
      docker compose up -d api
      ;;
    "all")
      log "전체 서비스 재시작 중..."
      docker compose up -d
      ;;
    *)
      error "알 수 없는 재시작 타겟: ${target}"
      exit 1
      ;;
  esac
}

# 헬스체크 대기
wait_for_health() {
  log "헬스체크 대기 중 (최대 ${HEALTH_CHECK_TIMEOUT}초)..."
  cd "${DEPLOY_PATH}"

  local elapsed=0
  while [ $elapsed -lt $HEALTH_CHECK_TIMEOUT ]; do
    # 모든 서비스 상태 확인
    local unhealthy_count
    unhealthy_count=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"unhealthy"' || true)
    local starting_count
    starting_count=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"starting"' || true)

    if [ "$unhealthy_count" -eq 0 ] && [ "$starting_count" -eq 0 ]; then
      log "모든 서비스가 정상 상태입니다."
      return 0
    fi

    echo -n "."
    sleep $HEALTH_CHECK_INTERVAL
    elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
  done

  echo ""
  warn "헬스체크 타임아웃 (${HEALTH_CHECK_TIMEOUT}초 경과)"
  warn "서비스 상태를 확인해주세요:"
  docker compose ps
  return 1
}

# 롤백 실행
rollback() {
  log "롤백 시작..."
  cd "${DEPLOY_PATH}"

  # 가장 최근 백업 찾기
  local latest_backup
  latest_backup=$(ls -t "${BACKUP_DIR}"/backup-*.commit 2>/dev/null | head -1)

  if [ -z "${latest_backup}" ]; then
    error "롤백할 백업이 없습니다."
    exit 1
  fi

  local commit_hash
  commit_hash=$(cat "${latest_backup}")
  log "롤백 대상 커밋: ${commit_hash}"

  git checkout "${commit_hash}"

  build_images "all"
  restart_services "all"

  if wait_for_health; then
    log "롤백 완료"
  else
    error "롤백 후 헬스체크 실패. 수동 확인이 필요합니다."
    exit 1
  fi
}

# 미사용 Docker 리소스 정리
cleanup() {
  log "미사용 Docker 리소스 정리 중..."
  docker image prune -f
  log "정리 완료"
}

# 배포 결과 출력
print_status() {
  cd "${DEPLOY_PATH}"
  echo ""
  log "========================================="
  log " BitScope 배포 상태"
  log "========================================="
  log " 커밋: $(git rev-parse --short HEAD)"
  log " 시간: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo ""
  docker compose ps
  echo ""
  log "========================================="
}

# ---------------------------------------------------------------------------
# 메인 로직
# ---------------------------------------------------------------------------

main() {
  local mode="all"
  local skip_build=false
  local do_rollback=false

  # 인수 파싱
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --web-only)
        mode="web"
        shift
        ;;
      --api-only)
        mode="api"
        shift
        ;;
      --no-build)
        skip_build=true
        shift
        ;;
      --rollback)
        do_rollback=true
        shift
        ;;
      -h|--help)
        echo "사용법: $0 [옵션]"
        echo ""
        echo "옵션:"
        echo "  --web-only    프론트엔드(web)만 배포"
        echo "  --api-only    백엔드(api)만 배포"
        echo "  --no-build    빌드 없이 재시작만"
        echo "  --rollback    이전 버전으로 롤백"
        echo "  -h, --help    도움말 표시"
        exit 0
        ;;
      *)
        error "알 수 없는 인수: $1"
        exit 1
        ;;
    esac
  done

  log "=== BitScope 배포 시작 ==="

  check_prerequisites

  if [ "${do_rollback}" = true ]; then
    rollback
    print_status
    exit 0
  fi

  # 백업
  backup_current_state

  # 코드 업데이트
  pull_latest

  # 빌드
  if [ "${skip_build}" = false ]; then
    build_images "${mode}"
  fi

  # 서비스 재시작
  restart_services "${mode}"

  # 헬스체크
  if wait_for_health; then
    log "배포 성공"
  else
    warn "일부 서비스가 비정상 상태입니다. 로그를 확인해주세요."
    warn "롤백하려면: $0 --rollback"
  fi

  # 정리
  cleanup

  # 상태 출력
  print_status

  log "=== BitScope 배포 완료 ==="
}

main "$@"
