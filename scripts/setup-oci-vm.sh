#!/usr/bin/env bash
# =============================================================================
# BitScope OCI VM 초기 설정 스크립트
#
# OCI Always Free Tier VM(ARM)에 Docker와 필요한 도구를 설치한다.
# 최초 배포 전 1회만 실행하면 된다.
#
# 사용법:
#   ssh ubuntu@<oci-vm-ip> 'bash -s' < scripts/setup-oci-vm.sh
#
# 지원 OS: Oracle Linux 8/9 (ARM), Ubuntu 22.04/24.04 (ARM)
#
# 요구사항: NF6.1
# =============================================================================

set -euo pipefail

echo "=== BitScope OCI VM 초기 설정 시작 ==="
echo "시간: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ---------------------------------------------------------------------------
# OS 감지
# ---------------------------------------------------------------------------
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "${ID}"
  else
    echo "unknown"
  fi
}

OS_ID=$(detect_os)
echo ">>> 감지된 OS: ${OS_ID}"

# ---------------------------------------------------------------------------
# 1. 시스템 업데이트
# ---------------------------------------------------------------------------
echo ">>> 시스템 패키지 업데이트..."
case "${OS_ID}" in
  ubuntu|debian)
    sudo apt-get update -y && sudo apt-get upgrade -y
    ;;
  ol|centos|rhel|rocky|almalinux)
    sudo dnf update -y
    ;;
  *)
    echo "경고: 지원하지 않는 OS(${OS_ID})입니다. 수동으로 패키지를 업데이트하세요."
    ;;
esac

# ---------------------------------------------------------------------------
# 2. Docker 설치
# ---------------------------------------------------------------------------
echo ">>> Docker 설치..."
case "${OS_ID}" in
  ubuntu|debian)
    # 기존 패키지 제거
    sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    # 필요 패키지 설치
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    # Docker GPG 키 추가
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    # Docker 리포지토리 추가
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ;;
  ol|centos|rhel|rocky|almalinux)
    sudo dnf install -y dnf-utils
    sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    ;;
  *)
    echo "경고: Docker를 수동으로 설치하세요: https://docs.docker.com/engine/install/"
    ;;
esac

# Docker 서비스 활성화 및 시작
sudo systemctl start docker
sudo systemctl enable docker

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 사용)
sudo usermod -aG docker "${USER}"

echo "Docker 버전: $(docker --version)"
echo "Docker Compose 버전: $(docker compose version)"

# ---------------------------------------------------------------------------
# 3. Git 설치 확인
# ---------------------------------------------------------------------------
echo ">>> Git 확인..."
if ! command -v git &> /dev/null; then
  case "${OS_ID}" in
    ubuntu|debian)
      sudo apt-get install -y git
      ;;
    ol|centos|rhel|rocky|almalinux)
      sudo dnf install -y git
      ;;
  esac
fi
echo "Git 버전: $(git --version)"

# ---------------------------------------------------------------------------
# 4. 방화벽 설정
# ---------------------------------------------------------------------------
echo ">>> 방화벽 설정..."
case "${OS_ID}" in
  ubuntu|debian)
    # Ubuntu는 iptables 기반 (OCI 보안 그룹에서 주로 관리)
    # iptables에 INPUT 규칙이 있으면 포트를 열어준다
    if sudo iptables -L INPUT -n 2>/dev/null | grep -q "DROP\|REJECT"; then
      sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
      sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
      echo "iptables에 80, 443 포트 규칙을 추가했습니다."
    fi
    # netfilter-persistent가 있으면 저장
    if command -v netfilter-persistent &> /dev/null; then
      sudo netfilter-persistent save
    fi
    echo "참고: OCI 콘솔의 Security List에서도 80, 443 포트를 열어야 합니다."
    ;;
  ol|centos|rhel|rocky|almalinux)
    if command -v firewall-cmd &> /dev/null; then
      sudo firewall-cmd --permanent --add-port=80/tcp
      sudo firewall-cmd --permanent --add-port=443/tcp
      sudo firewall-cmd --reload
      echo "방화벽 상태:"
      sudo firewall-cmd --list-all
    fi
    ;;
esac

# ---------------------------------------------------------------------------
# 5. 배포 디렉토리 생성
# ---------------------------------------------------------------------------
DEPLOY_PATH="/home/${USER}/bitscope"
echo ">>> 배포 디렉토리 생성: ${DEPLOY_PATH}"
mkdir -p "${DEPLOY_PATH}"
mkdir -p "${DEPLOY_PATH}/backups"

# ---------------------------------------------------------------------------
# 6. 로그 로테이션 설정
# ---------------------------------------------------------------------------
echo ">>> Docker 로그 로테이션 설정..."
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

sudo systemctl restart docker

# ---------------------------------------------------------------------------
# 7. 스왑 설정 (OCI Free Tier 메모리 절약)
# ---------------------------------------------------------------------------
echo ">>> 스왑 설정 (2GB)..."
if [ ! -f /swapfile ]; then
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
  echo "스왑 활성화 완료"
else
  echo "스왑 파일이 이미 존재합니다."
fi

# ---------------------------------------------------------------------------
# 완료
# ---------------------------------------------------------------------------
echo ""
echo "=== BitScope OCI VM 초기 설정 완료 ==="
echo ""
echo "다음 단계:"
echo "  1. 새 세션으로 다시 접속하세요 (docker 그룹 적용)"
echo "  2. 리포지토리를 클론하세요:"
echo "     cd ${DEPLOY_PATH} && git clone https://github.com/<owner>/bit-scope.git ."
echo "  3. 환경 변수를 설정하세요:"
echo "     cp .env.example .env && vi .env"
echo "  4. 서비스를 시작하세요:"
echo "     docker compose up -d"
echo ""
