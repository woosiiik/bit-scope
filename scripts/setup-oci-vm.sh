#!/usr/bin/env bash
# =============================================================================
# BitScope OCI VM 초기 설정 스크립트
#
# OCI Always Free Tier VM(ARM)에 Docker와 필요한 도구를 설치한다.
# 최초 배포 전 1회만 실행하면 된다.
#
# 사용법:
#   ssh opc@<oci-vm-ip> 'bash -s' < scripts/setup-oci-vm.sh
#
# 지원 OS: Oracle Linux 8/9 (ARM)
#
# 요구사항: NF6.1
# =============================================================================

set -euo pipefail

echo "=== BitScope OCI VM 초기 설정 시작 ==="
echo "시간: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ---------------------------------------------------------------------------
# 1. 시스템 업데이트
# ---------------------------------------------------------------------------
echo ">>> 시스템 패키지 업데이트..."
sudo dnf update -y

# ---------------------------------------------------------------------------
# 2. Docker 설치
# ---------------------------------------------------------------------------
echo ">>> Docker 설치..."
sudo dnf install -y dnf-utils
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

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
  sudo dnf install -y git
fi
echo "Git 버전: $(git --version)"

# ---------------------------------------------------------------------------
# 4. 방화벽 설정
# ---------------------------------------------------------------------------
echo ">>> 방화벽 설정..."
# HTTP(80) 및 HTTPS(443) 포트 개방
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload

echo "방화벽 상태:"
sudo firewall-cmd --list-all

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
