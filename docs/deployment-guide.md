# BitScope OCI 배포 가이드

## 개요

OCI Always Free Tier VM(ARM)에 Docker Compose로 BitScope를 배포하는 절차서입니다.

```
OCI ARM VM
├── Docker Compose
│   ├── nginx (리버스 프록시, 80/443 포트)
│   ├── web (Next.js, 3000 포트)
│   ├── api (NestJS, 4000 포트)
│   └── mysql (DB, 3306 포트)
```

---

## 사전 준비

### 1. OCI VM 생성

1. OCI 콘솔 → Compute → Instances → Create Instance
2. 설정:
   - Shape: VM.Standard.A1.Flex (ARM) — Always Free
   - OCPU: 1~4, Memory: 6~24GB (Free Tier 범위 내)
   - OS: Oracle Linux 8 or 9
   - SSH Key: 로컬 SSH 키 등록
3. 생성 완료 후 **Public IP** 확인

### 2. 방화벽 설정 (OCI Security List)

OCI 콘솔 → Networking → Virtual Cloud Networks → Security Lists:

| 포트 | 프로토콜 | 용도 |
|------|----------|------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS (도메인 확보 후) |

### 3. 로컬에서 SSH 접속 확인

```bash
ssh opc@<OCI_VM_PUBLIC_IP>
```

---

## Step 1: VM 초기 설정 (최초 1회)

로컬에서 스크립트를 전송하여 실행합니다:

```bash
ssh opc@<OCI_VM_IP> 'bash -s' < scripts/setup-oci-vm.sh
```

이 스크립트가 하는 일:
- 시스템 패키지 업데이트
- Docker CE / Docker Compose 설치
- 방화벽 포트 개방 (80, 443)
- Docker 로그 로테이션 설정
- 스왑 파일 설정 (2GB, 메모리 절약)

설치 완료 확인:
```bash
ssh opc@<OCI_VM_IP> "docker --version && docker compose version"
```

---

## Step 2: 소스 코드 배포

### 방법 A: Git Clone (추천)

```bash
ssh opc@<OCI_VM_IP>

# 프로젝트 클론
git clone https://github.com/<your-username>/bit-scope.git /home/opc/bitscope
cd /home/opc/bitscope
```

### 방법 B: 파일 직접 전송

```bash
# 로컬에서 실행
rsync -avz --exclude node_modules --exclude .next --exclude dist \
  ./ opc@<OCI_VM_IP>:/home/opc/bitscope/
```

---

## Step 3: 환경 변수 설정

OCI VM에서:

```bash
cd /home/opc/bitscope
cp .env.example .env
vi .env
```

### 필수 변경 항목

```bash
# MySQL 비밀번호 (반드시 변경!)
MYSQL_ROOT_PASSWORD=<강력한_비밀번호>
DB_PASSWORD=<강력한_비밀번호>

# WalletConnect Project ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<발급받은_ID>

# 텔레그램 봇 (선택)
TELEGRAM_BOT_TOKEN=<봇_토큰>
TELEGRAM_BOT_USERNAME=<봇_사용자명>
```

### IP 기반 접속 시 (도메인 없을 때)

```bash
NEXT_PUBLIC_API_URL=http://<OCI_VM_IP>/api/backend
NEXT_PUBLIC_WS_URL=http://<OCI_VM_IP>
CORS_ORIGINS=http://<OCI_VM_IP>
```

### 도메인 있을 때

```bash
NEXT_PUBLIC_API_URL=https://bitscope.example.com/api/backend
NEXT_PUBLIC_WS_URL=https://bitscope.example.com
CORS_ORIGINS=https://bitscope.example.com
DOMAIN=bitscope.example.com
CERTBOT_EMAIL=admin@example.com
```

---

## Step 4: Docker 빌드 & 실행

```bash
cd /home/opc/bitscope

# 빌드 + 실행 (첫 배포 시 10~20분 소요)
docker compose up -d --build

# 빌드 진행 상황 확인
docker compose logs -f
```

### 서비스 상태 확인

```bash
# 전체 서비스 상태
docker compose ps

# 기대 결과:
# NAME               STATUS    PORTS
# bitscope-nginx     Up        0.0.0.0:80->80/tcp
# bitscope-web       Up        3000/tcp
# bitscope-api       Up        4000/tcp
# bitscope-mysql     Up        3306/tcp
```

### 개별 서비스 로그 확인

```bash
docker compose logs -f web    # Next.js
docker compose logs -f api    # NestJS
docker compose logs -f mysql  # MySQL
docker compose logs -f nginx  # nginx
```

---

## Step 5: 접속 확인

브라우저에서:
```
http://<OCI_VM_IP>
```

확인 포인트:
- [ ] 지갑 연결 페이지가 표시되는가
- [ ] MetaMask로 지갑 연결이 되는가
- [ ] 설정 페이지에서 거래소 API Key 등록이 되는가
- [ ] 대시보드에서 포트폴리오가 표시되는가
- [ ] 김프 페이지에서 바이낸스 대비 프리미엄이 표시되는가

---

## Step 6: SSL 설정 (도메인 확보 후)

### 6-1. DNS 설정

도메인의 A 레코드를 OCI VM IP로 설정:
```
bitscope.example.com → <OCI_VM_IP>
```

### 6-2. SSL 인증서 발급

```bash
cd /home/opc/bitscope

# certbot으로 인증서 발급
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d bitscope.example.com \
  --email admin@example.com \
  --agree-tos \
  --no-eff-email
```

### 6-3. nginx SSL 설정 적용

```bash
# SSL 설정 템플릿을 실제 설정으로 복사
cp infra/nginx/ssl.conf.template infra/nginx/default.conf

# 도메인 이름 치환
sed -i 's/bitscope.example.com/실제도메인/g' infra/nginx/default.conf

# nginx 재시작
docker compose restart nginx
```

### 6-4. 인증서 자동 갱신 (cron)

```bash
# crontab 편집
crontab -e

# 매월 1일 자동 갱신 추가
0 3 1 * * cd /home/opc/bitscope && docker compose run --rm certbot renew && docker compose restart nginx
```

---

## 운영 관리

### 서비스 재시작

```bash
cd /home/opc/bitscope

# 전체 재시작
docker compose restart

# 특정 서비스만
docker compose restart api
docker compose restart web
```

### 업데이트 배포

```bash
cd /home/opc/bitscope

# 최신 코드 pull
git pull origin main

# 재빌드 + 재시작
docker compose up -d --build

# 또는 deploy.sh 사용
./scripts/deploy.sh
```

### 특정 서비스만 업데이트

```bash
# 프론트엔드만
./scripts/deploy.sh --web-only

# 백엔드만
./scripts/deploy.sh --api-only
```

### 롤백

```bash
./scripts/deploy.sh --rollback
```

### 로그 확인

```bash
# 실시간 로그
docker compose logs -f

# 최근 100줄
docker compose logs --tail 100 api

# 배포 로그
cat /home/opc/bitscope/deploy.log
```

### DB 백업

```bash
# MySQL 덤프
docker compose exec mysql mysqldump -u bitscope -p bitscope > backup_$(date +%Y%m%d).sql

# 복원
docker compose exec -i mysql mysql -u bitscope -p bitscope < backup_20260503.sql
```

### 디스크 정리

```bash
# 미사용 Docker 이미지 정리
docker system prune -a --volumes

# 오래된 백업 삭제 (30일 이상)
find /home/opc/bitscope/backups -mtime +30 -delete
```

---

## OCI Budget Alert 설정 (과금 방지)

1. OCI 콘솔 → Billing → Budgets → Create Budget
2. 설정:
   - Amount: 0 (또는 1 USD)
   - Alert Rule: Actual Spend >= 100% of Budget
   - Email: 본인 이메일
3. 이렇게 하면 무료 범위 초과 시 즉시 알림

---

## 트러블슈팅

### 서비스가 시작되지 않을 때

```bash
# 상세 로그 확인
docker compose logs --tail 50 <서비스명>

# 헬스체크 상태 확인
docker inspect bitscope-api | grep -A 10 Health
```

### MySQL 연결 실패

```bash
# MySQL 컨테이너 접속
docker compose exec mysql mysql -u root -p

# 사용자 권한 확인
SELECT user, host FROM mysql.user;
```

### 포트 접근 불가

```bash
# OCI VM 내부에서 포트 확인
sudo netstat -tlnp | grep -E '80|443|3000|4000'

# 방화벽 상태 확인
sudo firewall-cmd --list-all

# OCI Security List에서 포트가 열려 있는지 확인
```

### 메모리 부족

```bash
# 메모리 사용량 확인
free -h

# Docker 컨테이너별 메모리
docker stats --no-stream

# 스왑 확인
swapon --show
```

### Docker 빌드 실패 (ARM)

ARM 아키텍처에서 일부 npm 패키지가 빌드 실패할 수 있습니다:
```bash
# 빌드 캐시 삭제 후 재시도
docker compose build --no-cache
```

---

## 참고: 전체 포트 구성

| 서비스 | 컨테이너 포트 | 외부 노출 | 용도 |
|--------|:---:|:---:|------|
| nginx | 80, 443 | O | 리버스 프록시 |
| web | 3000 | X (nginx 경유) | Next.js |
| api | 4000 | X (nginx 경유) | NestJS |
| mysql | 3306 | X (내부만) | DB |
