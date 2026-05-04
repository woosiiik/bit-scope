# BitScope OCI 배포 가이드

## 개요

OCI Always Free Tier VM(ARM)에 Docker Compose로 BitScope를 배포하는 절차서입니다.

```
OCI ARM VM (Ubuntu 24.04)
├── Docker Compose
│   ├── nginx (리버스 프록시, 80/443 포트)
│   ├── web (Next.js standalone, 3000 포트)
│   ├── api (NestJS, 4000 포트)
│   └── mysql (DB, 3306 포트 - 외부 노출)
```

**현재 배포 환경:**
- 서버 IP: 158.179.168.88
- 도메인: bitscope.duckdns.org (DuckDNS 무료)
- OS: Ubuntu 24.04 (ARM)
- 사용자: ubuntu
- 배포 경로: /home/ubuntu/bitscope

---

## 사전 준비

### 1. OCI VM 생성

1. OCI 콘솔 → Compute → Instances → Create Instance
2. 설정:
   - Shape: VM.Standard.A1.Flex (ARM) — Always Free
   - OCPU: 1~4, Memory: 6~24GB (Free Tier 범위 내)
   - OS: Ubuntu 24.04 (ARM)
   - SSH Key: 로컬 SSH 키 등록
3. 생성 완료 후 **Public IP** 확인

### 2. 무료 도메인 발급 (DuckDNS)

1. https://www.duckdns.org 접속 → Google/GitHub 로그인
2. 서브도메인 입력 (예: `bitscope`) → Add domain
3. IP에 OCI VM Public IP 입력 → Update IP
4. 결과: `bitscope.duckdns.org`

### 3. 방화벽 설정 (OCI Security List)

OCI 콘솔 → Networking → Virtual Cloud Networks → Security Lists → Ingress Rules:

| 포트 | 프로토콜 | 용도 |
|------|----------|------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS (SSL 설정 후) |
| 3306 | TCP | MySQL 원격 접속 (데모용, 상용 시 제거) |

### 4. SSH 접속 확인

```bash
ssh ubuntu@<OCI_VM_IP>
```

---

## Step 1: VM 초기 설정 (최초 1회)

Ubuntu 24.04에 Docker가 이미 설치되어 있으면 건너뜁니다.

```bash
# Docker 설치 확인
docker --version && docker compose version
```

설치 안 되어 있으면:
```bash
# 로컬에서 스크립트 전송 실행 (Ubuntu/Oracle Linux 자동 감지)
ssh ubuntu@<OCI_VM_IP> 'bash -s' < scripts/setup-oci-vm.sh
```

Docker 그룹에 사용자 추가 (sudo 없이 docker 사용):
```bash
sudo usermod -aG docker ubuntu
# 재로그인 필요
exit
ssh ubuntu@<OCI_VM_IP>
```

---

## Step 2: 소스 코드 배포

### 방법 A: Git Clone (추천)

```bash
ssh ubuntu@<OCI_VM_IP>

git clone https://github.com/woosiiik/bit-scope.git /home/ubuntu/bitscope
cd /home/ubuntu/bitscope
```

### 방법 B: 파일 직접 전송

```bash
# 로컬에서 실행
rsync -avz --exclude node_modules --exclude .next --exclude dist \
  ./ ubuntu@<OCI_VM_IP>:/home/ubuntu/bitscope/
```

---

## Step 3: 환경 변수 설정

```bash
cd /home/ubuntu/bitscope
cp .env.example .env
vi .env
```

### .env 설정 내용

```bash
# nginx
NGINX_PORT=80
NGINX_SSL_PORT=443

# MySQL (반드시 변경!)
MYSQL_ROOT_PASSWORD=<강력한_비밀번호>
DB_USERNAME=bitscope
DB_PASSWORD=<강력한_비밀번호>
DB_DATABASE=bitscope
DB_CONNECTION_LIMIT=10
DB_LOGGING=false

# Next.js (도메인 기준)
NEXT_PUBLIC_API_URL=http://bitscope.duckdns.org/api/backend
NEXT_PUBLIC_WS_URL=http://bitscope.duckdns.org
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<WalletConnect_ID>

# NestJS
CORS_ORIGINS=http://bitscope.duckdns.org

# 텔레그램 봇 (선택, 미설정 시 기능 비활성화)
TELEGRAM_BOT_TOKEN=<봇_토큰>
TELEGRAM_BOT_USERNAME=<봇_사용자명>
```

> SSL 적용 전이므로 `http://`로 설정. SSL 적용 후 `https://`로 변경.

---

## Step 4: Docker 빌드 & 실행

```bash
cd /home/ubuntu/bitscope

# 빌드 + 실행 (첫 배포 시 10~20분 소요, ARM 빌드라 시간이 걸림)
sudo docker compose up -d --build

# 빌드 진행 상황 모니터링
sudo docker compose logs -f
```

### 빌드 캐시 문제 시

코드 변경이 반영되지 않으면 캐시 없이 재빌드:
```bash
sudo docker compose build --no-cache web
sudo docker compose build --no-cache api
sudo docker compose up -d --force-recreate
```

### 서비스 상태 확인

```bash
sudo docker compose ps

# 기대 결과 (모두 healthy):
# NAME             STATUS            PORTS
# bitscope-nginx   Up (healthy)      0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
# bitscope-web     Up (healthy)      3000/tcp
# bitscope-api     Up (healthy)      4000/tcp
# bitscope-mysql   Up (healthy)      0.0.0.0:3306->3306/tcp
```

### 개별 서비스 로그

```bash
sudo docker compose logs -f web     # Next.js
sudo docker compose logs -f api     # NestJS
sudo docker compose logs -f mysql   # MySQL
sudo docker compose logs -f nginx   # nginx
sudo docker compose logs web --tail 20  # 최근 20줄만
```

---

## Step 5: 접속 확인

브라우저에서:
```
http://bitscope.duckdns.org
```

확인 체크리스트:
- [ ] 지갑 연결 페이지가 표시되는가
- [ ] MetaMask로 지갑 연결이 되는가
- [ ] 설정 페이지에서 거래소 API Key 등록이 되는가
- [ ] 하이퍼리퀴드 활성화가 되는가
- [ ] 대시보드에서 포트폴리오가 표시되는가
- [ ] 거래소별 자산현황 카드가 표시되는가
- [ ] 김프 페이지에서 바이낸스 대비 프리미엄이 표시되는가
- [ ] 알림 설정이 가능한가
- [ ] 텔레그램 봇 연결이 되는가
- [ ] 언어 전환(한국어/English)이 되는가

### MySQL 원격 접속 (개발/디버깅용)

MySQL Workbench에서:
- Host: `158.179.168.88` (또는 `bitscope.duckdns.org`)
- Port: `3306`
- User: `bitscope`
- Password: `.env`에 설정한 DB_PASSWORD

---

## Step 6: SSL 설정 (선택)

### 6-1. certbot으로 인증서 발급

```bash
cd /home/ubuntu/bitscope

sudo docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d bitscope.duckdns.org \
  --email <본인_이메일> \
  --agree-tos \
  --no-eff-email
```

### 6-2. nginx SSL 설정 적용

```bash
# SSL 설정 템플릿 복사
cp infra/nginx/ssl.conf.template infra/nginx/default.conf

# 도메인 이름 치환
sed -i 's/bitscope.example.com/bitscope.duckdns.org/g' infra/nginx/default.conf

# nginx 재시작
sudo docker compose restart nginx
```

### 6-3. .env에서 http → https 변경

```bash
vi .env
# NEXT_PUBLIC_API_URL=https://bitscope.duckdns.org/api/backend
# NEXT_PUBLIC_WS_URL=https://bitscope.duckdns.org
# CORS_ORIGINS=https://bitscope.duckdns.org
```

web 재빌드 필요 (NEXT_PUBLIC_ 변수는 빌드 시점에 주입):
```bash
sudo docker compose build --no-cache web
sudo docker compose up -d --force-recreate
```

### 6-4. 인증서 자동 갱신

```bash
crontab -e

# 매월 1일 자동 갱신 추가
0 3 1 * * cd /home/ubuntu/bitscope && sudo docker compose run --rm certbot renew && sudo docker compose restart nginx
```

---

## 운영 관리

### 업데이트 배포

```bash
cd /home/ubuntu/bitscope

# 최신 코드 pull
git pull origin main

# 재빌드 + 재시작
sudo docker compose up -d --build

# 또는 deploy.sh 사용
./scripts/deploy.sh
```

### 특정 서비스만 업데이트

```bash
# 프론트엔드만 (NEXT_PUBLIC_ 변경 시 --no-cache 필요)
sudo docker compose build --no-cache web
sudo docker compose up -d --force-recreate web

# 백엔드만
sudo docker compose build --no-cache api
sudo docker compose up -d --force-recreate api

# 또는 deploy.sh 사용
./scripts/deploy.sh --web-only
./scripts/deploy.sh --api-only
```

### 서비스 재시작 (코드 변경 없이)

```bash
sudo docker compose restart         # 전체
sudo docker compose restart api     # 특정 서비스
sudo docker compose up -d --force-recreate web  # 컨테이너 재생성
```

### 롤백

```bash
./scripts/deploy.sh --rollback
```

### DB 백업/복원

```bash
# 백업
sudo docker compose exec mysql mysqldump -u bitscope -p bitscope > backup_$(date +%Y%m%d).sql

# 복원
sudo docker compose exec -i mysql mysql -u bitscope -p bitscope < backup_20260504.sql

# 컨테이너 내부에서 직접 접속
sudo docker compose exec -it mysql mysql -u bitscope -p bitscope
```

### 디스크 정리

```bash
# 미사용 Docker 이미지/컨테이너 정리
sudo docker system prune -a

# 볼륨까지 정리 (주의: DB 데이터 삭제됨!)
sudo docker system prune -a --volumes
```

---

## OCI Budget Alert 설정 (과금 방지)

1. OCI 콘솔 → Billing → Budgets → Create Budget
2. 설정:
   - Amount: 0 (또는 1 USD)
   - Alert Rule: Actual Spend >= 100% of Budget
   - Email: 본인 이메일
3. 무료 범위 초과 시 즉시 알림 수신

---

## 트러블슈팅

### web이 unhealthy 상태

```bash
# 로그 확인
sudo docker compose logs web --tail 20

# 서버 시작은 됐지만 healthcheck 실패하는 경우
# → IPv6 문제: healthcheck URL이 127.0.0.1인지 확인 (localhost는 IPv6로 resolve될 수 있음)
# → indexedDB 에러: server-preload.js가 CMD에 --require로 포함되어 있는지 확인
```

### 빌드 시 "module not found" 에러

```bash
# shared 패키지 빌드 누락
# Dockerfile에서 RUN pnpm --filter @bitscope/shared build 가 web/api 빌드 전에 있는지 확인

# 캐시 문제
sudo docker compose build --no-cache
```

### MySQL 연결 실패

```bash
# MySQL 컨테이너 접속
sudo docker compose exec mysql mysql -u root -p

# 사용자 권한 확인
SELECT user, host FROM mysql.user;
SHOW GRANTS FOR 'bitscope'@'%';
```

### 포트 접근 불가

```bash
# 서버 내부에서 포트 확인
sudo ss -tlnp | grep -E '80|443|3000|4000|3306'

# OCI Security List에서 해당 포트가 열려 있는지 확인
# Ubuntu 방화벽 확인
sudo ufw status
```

### 메모리 부족

```bash
# 메모리 사용량 확인
free -h

# 컨테이너별 메모리 사용량
sudo docker stats --no-stream

# 스왑 확인/추가
swapon --show
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### NEXT_PUBLIC_ 환경변수 변경이 반영 안 될 때

NEXT_PUBLIC_ 변수는 빌드 시점에 주입되므로 .env 변경 후 반드시 재빌드:
```bash
sudo docker compose build --no-cache web
sudo docker compose up -d --force-recreate web
```

---

## 서비스 리소스 제한

Docker Compose에서 OCI Free Tier 메모리 절약을 위해 제한 설정됨:

| 서비스 | 메모리 제한 | 예약 |
|--------|:---------:|:----:|
| nginx | 128M | 64M |
| web | 512M | 256M |
| api | 512M | 256M |
| mysql | 512M | 256M |

---

## 전체 포트 구성

| 서비스 | 컨테이너 포트 | 외부 노출 | 용도 |
|--------|:---:|:---:|------|
| nginx | 80, 443 | O | 리버스 프록시 |
| web | 3000 | X (nginx 경유) | Next.js |
| api | 4000 | X (nginx 경유) | NestJS |
| mysql | 3306 | O (데모용) | DB |
