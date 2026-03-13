# yt-dlp API 서버 — 카페24 VPS 설치 가이드 (A to Z)

> **대상**: 서버를 생전 처음 다루는 분
> **소요 시간**: 약 30~40분
> **비용**: 월 7,000원 + 설치비 22,000원 (첫 달만)
> **작성일**: 2026년 3월 12일

---

## 전체 구조 한눈에 보기

```
내 웹앱(브라우저)
   │
   │ ① "이 영상 다운받을 URL 줘" (API 요청)
   ▼
카페24 VPS (내 서버)
   │
   │ ② yt-dlp가 YouTube에서 스트림 URL 추출
   ▼
   │ ③ 스트림 URL을 JSON 텍스트로 반환
   │
내 웹앱(브라우저)
   │
   │ ④ 받은 URL로 YouTube에서 직접 다운로드
   ▼
영상 파일 (브라우저에서 처리)
```

**핵심 포인트**: 서버는 URL(텍스트)만 알려주고, 실제 영상은 브라우저가 YouTube에서 직접 받습니다.
→ 서버 트래픽 거의 0 (월 300GB 트래픽이면 사실상 무제한), 속도는 YouTube CDN 최대 속도.

---

## 비용 정리

| 항목 | 비용 |
|------|------|
| 카페24 VPS 일반형 (월) | **₩7,000** |
| 설치비 (최초 1회) | ₩22,000 |
| 도메인 (연, 선택) | ~₩10,000 |
| Cloudflare (선택) | 무료 |
| **첫 달 합계** | **₩29,000** |
| **다음 달부터** | **₩7,000/월** |

> 💡 도메인과 Cloudflare 없이도 IP 주소로 바로 사용 가능합니다. 나중에 추가해도 됩니다.

---

## 1단계: 카페24 회원가입

### 1-1. 카페24 계정 만들기

1. **https://hosting.cafe24.com** 에 접속
2. 오른쪽 위 **「회원가입」** 클릭
3. 일반 회원가입 진행:
   - 이름, 이메일, 비밀번호 입력
   - 휴대폰 인증
4. 가입 완료!

> 이미 카페24 쇼핑몰 등으로 계정이 있으면 그 계정으로 로그인하면 됩니다.

---

## 2단계: VPS(가상서버) 신청

### 2-1. 상품 페이지 이동

1. **https://hosting.cafe24.com** 에 로그인
2. 상단 메뉴에서 **「서버호스팅」** → **「가상서버호스팅」** 클릭
3. 또는 직접 접속: `hosting.cafe24.com/?controller=new_product_page&page=virtual`

### 2-2. 플랜 선택

**리눅스 가상서버** 탭에서 선택합니다:

| 플랜 | 월 요금 | RAM | SSD | 월 트래픽 | 추천 |
|------|--------|-----|-----|----------|------|
| **일반형** | ₩7,000 | 1GB | 30GB | 300GB | **✅ 이거면 충분** |
| 비즈니스 | ₩14,000 | 2GB | 40GB | 500GB | 여유 원하면 |
| 퍼스트클래스 | ₩22,000 | 3GB | 50GB | 800GB | |

> **yt-dlp API 서버는 가벼운 작업이라 일반형(1GB)이면 충분합니다.**
> Node.js + yt-dlp는 메모리를 200~300MB 정도만 사용합니다.

**「일반형 신청하기」** 클릭

### 2-3. 서버 설정

신청 화면에서 아래와 같이 입력합니다:

#### 운영체제(OS) 선택
- **Ubuntu 22.04** 선택 (Rocky Linux 말고 반드시 Ubuntu!)

#### ROOT 비밀번호 설정
- 서버 접속용 비밀번호를 설정합니다
- **이 비밀번호를 꼭 기억하세요!** 나중에 SSH 접속할 때 필요합니다
- 예시: `MyServer2026!` (영문 대소문자 + 숫자 + 특수문자 조합)

#### 계약 기간
- **1개월**: 할인 없음
- **12개월**: 10% 할인 → 월 ₩6,300
- 처음이면 1개월로 시작하세요. 잘 되면 나중에 연장하면 됩니다.

### 2-4. 결제

- **결제 방법**: 신용카드, 체크카드, 카카오페이, 네이버페이, 무통장입금 등
- 결제 완료!

### 2-5. 서버 설치 대기

- 결제 후 **약 10~30분** 이내에 서버가 설치됩니다
- 설치 완료되면 **문자(SMS)**가 옵니다
- 카페24 관리 콘솔(나의서비스관리)에서 **서버 IP 주소**를 확인할 수 있습니다

### 2-6. 서버 IP 확인

1. **https://hosting.cafe24.com** 로그인
2. 오른쪽 위 **「나의서비스관리」** 클릭
3. 가상서버호스팅 항목에서 **서버 IP** 확인
4. 예: `112.175.xx.xx` — **이 IP를 메모하세요!**

---

## 3단계: SSH 접속 (서버에 로그인하기)

SSH = 내 컴퓨터에서 서버 컴퓨터에 원격 접속하는 방법입니다.

### Mac에서 접속 (터미널 사용)

1. **터미널** 앱을 엽니다
   - Spotlight (Cmd + Space) → "터미널" 검색 → 실행

2. 아래 명령어를 입력합니다:

```bash
ssh root@112.175.xx.xx
```

> `112.175.xx.xx` 부분을 2단계에서 메모한 **실제 서버 IP**로 바꿔주세요.

3. 처음 접속하면 이런 메시지가 나옵니다:

```
The authenticity of host '112.175.xx.xx' can't be established.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**`yes`** 를 입력하고 Enter

4. 비밀번호를 입력합니다:
   - 2단계에서 설정한 **ROOT 비밀번호** 입력
   - ⚠️ 비밀번호 입력할 때 화면에 아무것도 안 보이는 게 정상입니다! 그냥 타이핑하고 Enter

5. 접속 성공하면 이런 화면이 보입니다:

```
Welcome to Ubuntu 22.04...
root@server:~#
```

**이 화면이 보이면 성공입니다!** 🎉

### Windows에서 접속 (PuTTY 사용)

1. **PuTTY 다운로드**: https://www.putty.org → Download PuTTY → 64-bit x86 설치

2. PuTTY 실행 후:
   - **Host Name**: `112.175.xx.xx` (서버 IP)
   - **Port**: `22`
   - **Connection type**: `SSH` 선택
   - **「Open」** 클릭

3. 보안 경고창이 뜨면 **「Accept」** 클릭

4. 검은 화면이 나오면:
   - `login as:` → **`root`** 입력 후 Enter
   - `Password:` → **ROOT 비밀번호** 입력 후 Enter (화면에 안 보이는 게 정상)

5. 접속 성공!

---

## 4단계: 서버 초기 설정

SSH 접속한 상태에서 아래 명령어들을 **한 줄씩** 복사 → 붙여넣기 → Enter 합니다.

> **복사/붙여넣기 방법**:
> - Mac 터미널: 복사(Cmd+C), 붙여넣기(Cmd+V)
> - PuTTY: 복사(Ctrl+C), 붙여넣기(마우스 오른쪽 클릭)

### 4-1. 시스템 업데이트

서버를 처음 받으면 항상 최신으로 업데이트합니다:

```bash
apt update -y && apt upgrade -y
```

> 이 과정이 2~5분 걸릴 수 있습니다. 끝날 때까지 기다리세요.
> 중간에 보라색 화면이 나오면 Enter만 눌러주세요.

### 4-2. 필수 프로그램 설치

```bash
apt install -y curl wget git python3 python3-pip ffmpeg ufw
```

### 4-3. Node.js 20 LTS 설치

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

설치 확인:
```bash
node --version
```
`v20.x.x` 같은 버전이 나오면 성공!

### 4-4. yt-dlp 설치

```bash
pip3 install --break-system-packages -U yt-dlp
```

> `--break-system-packages` 경고가 나올 수 있는데 정상입니다. 무시하세요.

설치 확인:
```bash
yt-dlp --version
```
`2026.xx.xx` 같은 날짜가 나오면 성공!

### 4-5. yt-dlp 경로 확인

```bash
which yt-dlp
```

`/usr/local/bin/yt-dlp` 가 나오면 OK.
다른 경로가 나오면 심볼릭 링크를 만듭니다:

```bash
ln -sf $(which yt-dlp) /usr/local/bin/yt-dlp
```

---

## 5단계: yt-dlp API 서버 설치

### 5-1. 프로젝트 파일 가져오기

**방법 A: Git으로 가져오기 (추천)**

```bash
cd ~
git clone https://github.com/groove1027/all-in-one-production.git
cd all-in-one-production/server
```

**방법 B: Git이 안 되면 직접 만들기**

> 방법 A가 안 될 경우에만 사용. 보통은 방법 A로 하면 됩니다.

```bash
mkdir -p ~/server && cd ~/server
```

그 다음 `index.js`, `package.json`, `.env.example`, `install.sh`, `update-ytdlp.sh` 파일을
로컬에서 `scp` 명령어로 전송합니다 (5-1B 참고).

### 5-1B. (방법 B 전용) 로컬에서 파일 전송

**내 맥의 새 터미널 창**에서 (서버 접속 창 말고!):

```bash
scp -r /Users/jihoo/Downloads/all-in-one-production-build4/server/ root@112.175.xx.xx:~/server/
```

비밀번호 입력 → 파일 전송 완료

다시 **서버 터미널**로 돌아와서:

```bash
cd ~/server
```

### 5-2. 앱 디렉토리 만들기

```bash
mkdir -p /opt/ytdlp-api
cp index.js package.json .env.example update-ytdlp.sh /opt/ytdlp-api/
chmod +x /opt/ytdlp-api/update-ytdlp.sh
cd /opt/ytdlp-api
```

### 5-3. API 키 생성 & 환경변수 설정

```bash
# 랜덤 API 키 생성
API_KEY=$(openssl rand -hex 32)
echo "생성된 API 키: $API_KEY"
```

**⚠️ 화면에 나오는 API 키를 반드시 메모하세요!** 나중에 앱에서 사용합니다.

```bash
# .env 파일 생성
cat > /opt/ytdlp-api/.env << EOF
PORT=3100
API_KEY=$API_KEY
ALLOWED_ORIGINS=*
YTDLP_PATH=/usr/local/bin/yt-dlp
MAX_CONCURRENT=5
CACHE_TTL=3600
LOG_LEVEL=info
EOF
```

생성된 파일 확인:
```bash
cat /opt/ytdlp-api/.env
```

### 5-4. npm 패키지 설치

```bash
cd /opt/ytdlp-api
npm install --production
```

> express, cors, helmet 등이 설치됩니다. 1~2분 걸릴 수 있습니다.

### 5-5. 서버 테스트 (수동 실행)

일단 제대로 되는지 테스트해봅니다:

```bash
node /opt/ytdlp-api/index.js
```

이런 메시지가 나오면 성공:
```
[2026-03-12T...] [INFO] yt-dlp API Server started on port 3100
[2026-03-12T...] [INFO] Auth: enabled
[2026-03-12T...] [INFO] yt-dlp version: 2026.xx.xx
```

**Ctrl+C** 를 눌러서 종료합니다 (다음 단계에서 자동 실행으로 설정할 거예요).

---

## 6단계: 서버 자동 실행 설정 (systemd)

서버가 재부팅되어도 자동으로 실행되게 설정합니다.

### 6-1. 서비스 파일 생성

```bash
cat > /etc/systemd/system/ytdlp-api.service << 'EOF'
[Unit]
Description=yt-dlp API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ytdlp-api
ExecStart=/usr/bin/node /opt/ytdlp-api/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# 로그
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ytdlp-api

[Install]
WantedBy=multi-user.target
EOF
```

### 6-2. 서비스 시작

```bash
# systemd에 등록
systemctl daemon-reload

# 서비스 시작
systemctl start ytdlp-api

# 부팅 시 자동 시작 설정
systemctl enable ytdlp-api
```

### 6-3. 실행 확인

```bash
systemctl status ytdlp-api
```

이런 화면이 나오면 성공:
```
● ytdlp-api.service - yt-dlp API Server
     Loaded: loaded (/etc/systemd/system/ytdlp-api.service; enabled)
     Active: active (running) since ...
```

**`active (running)`** 이 보이면 서버가 정상 작동 중입니다!

### 6-4. 내부 테스트

```bash
curl http://localhost:3100/health
```

예상 응답:
```json
{"status":"ok","version":"1.0.0","activeRequests":0,"cacheSize":0,"uptime":5}
```

---

## 7단계: 방화벽 설정

외부에서 서버에 접속할 수 있도록 포트를 열어줍니다.

### 7-1. 카페24 관리 콘솔에서 방화벽 열기

카페24 VPS는 자체 방화벽이 있을 수 있습니다:

1. **https://hosting.cafe24.com** → **「나의서비스관리」**
2. 해당 가상서버 → **「방화벽 관리」** 또는 **「보안 설정」** 메뉴
3. 아래 포트를 **허용(Allow)** 으로 추가:

| 포트 | 용도 |
|------|------|
| 22 | SSH 접속 (이미 열려있을 수 있음) |
| 80 | HTTP (나중에 Cloudflare 쓸 때) |
| 443 | HTTPS (나중에 Cloudflare 쓸 때) |
| 3100 | yt-dlp API 서버 |

> 카페24 관리 콘솔에 방화벽 메뉴가 없으면 기본적으로 다 열려있는 겁니다. 바로 7-2로 넘어가세요.

### 7-2. 서버 내부 방화벽 (ufw) 설정

SSH 접속한 서버에서:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3100/tcp
ufw --force enable
```

확인:
```bash
ufw status
```

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
3100/tcp                   ALLOW       Anywhere
```

---

## 8단계: 외부에서 테스트

### 8-1. 헬스체크

**내 맥의 새 터미널 창**에서 (서버 접속 창 말고!):

```bash
curl http://112.175.xx.xx:3100/health
```

> `112.175.xx.xx`를 실제 서버 IP로 바꿔주세요.

응답이 오면 서버가 외부에서도 접속 가능한 겁니다!

```json
{"status":"ok","version":"1.0.0","activeRequests":0,"cacheSize":0,"uptime":123}
```

### 8-2. 영상 URL 추출 테스트

```bash
curl -H "X-API-Key: 여기에5단계에서생성한API키" \
  "http://112.175.xx.xx:3100/api/extract?url=dQw4w9WgXcQ&quality=360p"
```

응답 예시:
```json
{
  "url": "https://rr1---sn-xxx.googlevideo.com/videoplayback?...",
  "title": "Rick Astley - Never Gonna Give You Up",
  "duration": 212,
  "width": 640,
  "height": 360,
  "cached": false
}
```

**이 응답이 오면 yt-dlp API 서버 설치 완료입니다!** 🎉

### 8-3. 안 되면?

```bash
# 서버에서 직접 테스트 (SSH 접속 상태에서)
curl http://localhost:3100/health
```

- **localhost에서는 되는데 외부에서 안 된다** → 방화벽 문제. 7단계 다시 확인
- **localhost에서도 안 된다** → 서버가 안 돌고 있음. `systemctl status ytdlp-api` 확인
- **yt-dlp 오류** → `yt-dlp --version`으로 설치 확인, `pip3 install -U yt-dlp`로 업데이트

---

## 9단계: yt-dlp 자동 업데이트 설정

YouTube가 가끔 yt-dlp를 막으면, yt-dlp가 업데이트로 대응합니다.
매일 새벽 4시에 자동 업데이트되도록 설정합니다.

```bash
# cron 등록
(crontab -l 2>/dev/null | grep -v "update-ytdlp"; echo "0 4 * * * /opt/ytdlp-api/update-ytdlp.sh >> /var/log/ytdlp-update.log 2>&1") | crontab -
```

확인:
```bash
crontab -l
```

`0 4 * * * /opt/ytdlp-api/update-ytdlp.sh ...` 가 보이면 성공!

---

## 10단계: 프론트엔드(앱) 연동

### 10-1. 앱 설정 화면에서 서버 정보 입력

앱의 설정에서:
- **서버 주소**: `http://112.175.xx.xx:3100` (실제 서버 IP)
- **API 키**: 5단계에서 생성한 키

### 10-2. 브라우저 개발자 도구에서 직접 설정 (임시)

아직 설정 UI가 없다면, 브라우저 콘솔(F12)에서:

```javascript
localStorage.setItem('YTDLP_API_URL', 'http://112.175.xx.xx:3100');
localStorage.setItem('YTDLP_API_KEY', '여기에API키');
```

새로고침하면 적용됩니다.

---

## 11단계: (선택) Cloudflare로 HTTPS + 보안 추가

> 지금 당장은 안 해도 됩니다. IP로 잘 작동하는 걸 확인한 후에 나중에 추가해도 됩니다.
> 하지만 실서비스에는 HTTPS가 필수이므로 결국 설정하는 걸 추천합니다.

### Cloudflare를 쓰면 좋은 이유
1. **무료 HTTPS** — 인증서 자동 발급
2. **서버 IP 숨김** — 실제 IP 노출 방지
3. **DDoS 보호** — 공격 차단

### 11-1. 도메인 필요

Cloudflare를 쓰려면 도메인이 필요합니다.
- **가비아** (gabia.com): `.com` 도메인 연 약 ₩11,000
- **Namecheap** (namecheap.com): `.com` 도메인 연 약 $9

### 11-2. Cloudflare 가입 & 설정

1. https://cloudflare.com 에서 가입 (무료)
2. **「Add a site」** → 도메인 입력
3. **Plan**: **Free** 선택
4. DNS 레코드 추가:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `api` | `112.175.xx.xx` (서버 IP) | ✅ Proxied (주황색 구름) |

5. 도메인 구매처에서 네임서버를 Cloudflare가 알려주는 값으로 변경
6. Cloudflare → **SSL/TLS** → **Full** 선택

### 11-3. 설정 완료 후

앱 설정에서 서버 주소를 변경:
- **변경 전**: `http://112.175.xx.xx:3100`
- **변경 후**: `https://api.내도메인.com`

서버의 ALLOWED_ORIGINS도 업데이트:

```bash
# 서버에 SSH 접속 후
nano /opt/ytdlp-api/.env
```

`ALLOWED_ORIGINS` 줄을 수정:
```
ALLOWED_ORIGINS=https://내앱도메인.com
```

저장: `Ctrl+O` → `Enter` → `Ctrl+X`

서버 재시작:
```bash
systemctl restart ytdlp-api
```

---

## 자주 쓰는 명령어 모음

SSH 접속한 상태에서 사용하는 명령어들입니다:

```bash
# ────── 서버 관리 ──────

# 서버 상태 확인
systemctl status ytdlp-api

# 서버 재시작
systemctl restart ytdlp-api

# 서버 중지
systemctl stop ytdlp-api

# 서버 시작
systemctl start ytdlp-api

# ────── 로그 보기 ──────

# 실시간 로그 보기 (Ctrl+C로 종료)
journalctl -u ytdlp-api -f

# 최근 로그 50줄
journalctl -u ytdlp-api -n 50

# ────── yt-dlp 관리 ──────

# 현재 버전 확인
yt-dlp --version

# 수동 업데이트
pip3 install --break-system-packages -U yt-dlp
systemctl restart ytdlp-api

# ────── 서버 상태 ──────

# API 헬스체크
curl http://localhost:3100/health

# 메모리 사용량 확인
free -h

# 디스크 사용량 확인
df -h

# ────── 설정 변경 ──────

# .env 파일 수정
nano /opt/ytdlp-api/.env
# 수정 후 반드시 재시작:
systemctl restart ytdlp-api
```

---

## 문제 해결 (FAQ)

### "SSH 접속이 안 돼요"

1. **IP 주소 확인**: 카페24 나의서비스관리에서 IP 재확인
2. **비밀번호 확인**: 비밀번호 입력 시 화면에 안 보이는 게 정상입니다
3. **서버 상태**: 카페24 콘솔에서 서버가 "실행 중"인지 확인
4. **설치 완료 대기**: 결제 후 최대 30분까지 기다려야 할 수 있습니다
5. 그래도 안 되면: 카페24 서버호스팅 고객센터 **1599-3414**

### "서버에서 curl은 되는데 외부에서 안 돼요"

방화벽 문제입니다:
```bash
# 서버에서 확인
ufw status
# 3100 포트가 ALLOW인지 확인

# 안 열려있으면
ufw allow 3100/tcp
```

카페24 관리 콘솔에도 방화벽이 있을 수 있으니 거기서도 3100 포트 확인.

### "yt-dlp 추출이 실패해요"

```bash
# 1. 버전 확인 (너무 오래된 버전이면 YouTube가 막음)
yt-dlp --version

# 2. 수동 업데이트
pip3 install --break-system-packages -U yt-dlp

# 3. 직접 테스트
yt-dlp -f "bestvideo[height<=360]+bestaudio" --get-url "https://youtube.com/watch?v=dQw4w9WgXcQ"

# 4. 서버 재시작
systemctl restart ytdlp-api
```

### "메모리가 부족해요"

```bash
# 메모리 확인
free -h

# 서버 재시작 (메모리 해제)
systemctl restart ytdlp-api
```

메모리가 자주 부족하면 카페24에서 RAM 추가(1GB당 ₩6,600/월) 또는 비즈니스 플랜(2GB)으로 업그레이드.

### "서버 코드를 업데이트하고 싶어요"

```bash
# 방법 1: Git으로 업데이트 (Git clone으로 설치한 경우)
cd ~/all-in-one-production
git pull
cp server/index.js /opt/ytdlp-api/
cp server/package.json /opt/ytdlp-api/
cd /opt/ytdlp-api && npm install --production
systemctl restart ytdlp-api

# 방법 2: 파일 직접 전송 (내 맥에서)
scp index.js root@112.175.xx.xx:/opt/ytdlp-api/
# 서버에서:
systemctl restart ytdlp-api
```

---

## 전체 과정 요약 (체크리스트)

- [ ] 카페24 회원가입
- [ ] 리눅스 VPS 일반형 신청 (Ubuntu 22.04, ROOT 비밀번호 설정)
- [ ] 결제 (카카오페이/네이버페이/카드)
- [ ] 서버 설치 완료 문자 수신 & IP 확인
- [ ] SSH 접속 성공 (`ssh root@서버IP`)
- [ ] 시스템 업데이트 (`apt update && apt upgrade`)
- [ ] Node.js 20 설치
- [ ] yt-dlp 설치
- [ ] 서버 코드 복사 (Git clone 또는 scp)
- [ ] .env 파일 설정 (API 키 생성)
- [ ] npm install
- [ ] systemd 서비스 등록 & 시작
- [ ] 방화벽 포트 열기 (22, 80, 443, 3100)
- [ ] 외부에서 헬스체크 성공 (`curl http://서버IP:3100/health`)
- [ ] 영상 URL 추출 테스트 성공
- [ ] yt-dlp 자동 업데이트 cron 등록
- [ ] 앱에서 서버 주소 & API 키 설정
- [ ] (선택) Cloudflare 도메인 + HTTPS 설정

---

## 스펙 요약

| 항목 | 값 |
|------|-----|
| VPS | 카페24 일반형 (1GB RAM, 30GB SSD) |
| OS | Ubuntu 22.04 |
| 런타임 | Node.js 20 LTS |
| 서버 | Express.js (port 3100) |
| yt-dlp | pip3로 설치, 매일 자동 업데이트 |
| 인증 | API Key (X-API-Key 헤더) |
| 동시 요청 | 최대 5개 |
| 캐시 | 인메모리 (1시간 TTL) |
| 월 비용 | ₩7,000 |
