# yt-dlp API 서버 — A to Z 설치 가이드

> **대상**: 서버를 처음 다루는 분
> **소요 시간**: 약 30~40분
> **비용**: 완전 무료 (Oracle Cloud Free Tier + Cloudflare Free)

---

## 전체 구조 한눈에 보기

```
내 웹앱(브라우저)
   │
   │ ① "이 영상 다운받을 URL 줘" (API 요청)
   ▼
Cloudflare (무료 CDN & 보안)
   │
   │ ② 요청을 VPS로 전달
   ▼
Oracle Cloud VPS (무료 서버)
   │
   │ ③ yt-dlp가 YouTube에서 스트림 URL 추출
   ▼
   │ ④ 스트림 URL을 JSON으로 반환
   │
내 웹앱(브라우저)
   │
   │ ⑤ 받은 URL로 YouTube CDN에서 직접 다운로드
   ▼
영상 파일 (브라우저에서 처리)
```

**핵심 포인트**: 서버는 URL(텍스트)만 알려주고, 실제 영상은 브라우저가 YouTube에서 직접 받습니다.
→ 서버 트래픽 거의 0, 속도는 YouTube CDN 최대 속도.

---

## 1단계: Oracle Cloud 가입

### 1-1. 계정 생성

1. **https://cloud.oracle.com** 에 접속
2. **「Sign Up for Free」** 클릭
3. 정보 입력:
   - **Country**: South Korea
   - **Name**: 본인 이름 (영문)
   - **Email**: 이메일
   - **Password**: 비밀번호 설정
4. **이메일 인증** — 받은 메일에서 인증 링크 클릭
5. **추가 정보 입력**:
   - **Cloud Account Name**: 아무 이름 (예: `jihoo-cloud`) — 이게 나중에 로그인 ID가 됩니다
   - **Home Region**: **South Korea Central (Chuncheon)** 선택 ← 한국에서 가장 빠름
6. **결제 정보 입력**:
   - 신용카드 또는 체크카드 등록 필요 (확인용 $1 결제 후 자동 취소)
   - **Free Tier만 사용하면 절대 과금되지 않습니다**
   - "Always Free" 리소스만 사용하면 됩니다

### 1-2. 가입 완료 확인

- 가입 후 약 1~10분 내에 계정 활성화 이메일이 옵니다
- https://cloud.oracle.com 에서 로그인 가능하면 성공!

---

## 2단계: VPS 인스턴스 생성

### 2-1. 인스턴스 만들기

1. Oracle Cloud 콘솔 로그인
2. 왼쪽 메뉴 ☰ → **「Compute」** → **「Instances」** 클릭
3. **「Create Instance」** (파란 버튼) 클릭

### 2-2. 인스턴스 설정

**Name**: `ytdlp-api` (원하는 이름)

**Image and shape** (이미지 & 사양):
1. **「Edit」** 클릭
2. Image: **Canonical Ubuntu 22.04** 선택
3. Shape: **「Change shape」** 클릭
   - **Ampere** (ARM) 탭 선택
   - **VM.Standard.A1.Flex** 선택
   - OCPUs: **2** (최대 4까지 무료)
   - Memory: **12 GB** (최대 24GB까지 무료)

   > 💡 ARM 서버는 Always Free로 4코어 24GB까지 무료입니다.
   > yt-dlp API에는 2코어 12GB면 충분합니다.

**Networking**:
- 기본값 그대로 두면 됩니다
- VCN(가상 네트워크)과 Subnet이 자동 생성됩니다

**Add SSH keys** (매우 중요!):
1. **「Generate a key pair for me」** 선택
2. **「Save Private Key」** 클릭 — `.key` 파일이 다운로드됩니다
3. **이 파일을 절대 잃어버리지 마세요!** 서버 접속에 필요합니다
4. 다운로드 위치 예시: `~/Downloads/ssh-key-2026-xx-xx.key`

### 2-3. 생성 완료

1. **「Create」** 클릭
2. 인스턴스가 **PROVISIONING** → **RUNNING** 상태가 될 때까지 1~3분 기다림
3. **Public IP Address** 확인 — 이 숫자를 메모하세요 (예: `140.238.xx.xx`)

> ⚠️ "Out of capacity" 에러가 나면:
> ARM 인스턴스가 인기가 많아서 자리가 없는 겁니다.
> 5~10분 후 다시 시도하거나, OCPUs를 1로 줄여보세요.

---

## 3단계: 방화벽 설정 (Oracle Cloud 웹 콘솔)

Oracle Cloud에는 **2중 방화벽**이 있습니다:
1. **Security List** (Oracle Cloud 네트워크 방화벽) ← 여기서 먼저 열어야 함
2. **iptables/ufw** (서버 내부 방화벽) ← install.sh가 자동 설정

### 3-1. Security List에 포트 열기

1. 인스턴스 상세 페이지에서 **「Subnet」** 링크 클릭
2. **「Security Lists」** → **「Default Security List for ...」** 클릭
3. **「Add Ingress Rules」** (파란 버튼) 클릭
4. 아래 규칙들을 추가:

**HTTP (80)** — Cloudflare용:
- Source CIDR: `0.0.0.0/0`
- Destination Port Range: `80`
- Description: `HTTP`

**HTTPS (443)** — Cloudflare용:
- Source CIDR: `0.0.0.0/0`
- Destination Port Range: `443`
- Description: `HTTPS`

**API 포트 (3100)** — 직접 테스트용:
- Source CIDR: `0.0.0.0/0`
- Destination Port Range: `3100`
- Description: `yt-dlp API`

> 나중에 Cloudflare 설정이 끝나면 3100 포트는 닫아도 됩니다.

---

## 4단계: SSH 접속 (서버에 로그인)

### Mac에서 접속

터미널 앱을 열고:

```bash
# 1. SSH 키 파일 권한 설정 (처음 한 번만)
chmod 400 ~/Downloads/ssh-key-2026-xx-xx.key

# 2. SSH 접속
ssh -i ~/Downloads/ssh-key-2026-xx-xx.key ubuntu@140.238.xx.xx
```

- `~/Downloads/ssh-key-2026-xx-xx.key` → 2단계에서 다운로드한 키 파일 경로
- `140.238.xx.xx` → 2단계에서 메모한 Public IP

### Windows에서 접속

1. **PuTTY** 다운로드: https://www.putty.org
2. PuTTYgen으로 `.key` 파일을 `.ppk`로 변환
3. PuTTY에서:
   - Host Name: `140.238.xx.xx`
   - Connection → SSH → Auth → Private key file: 변환한 `.ppk` 파일
   - Session → Open

### 접속 성공하면

```
Welcome to Ubuntu 22.04...
ubuntu@ytdlp-api:~$
```

이 화면이 보이면 성공입니다! 🎉

---

## 5단계: 서버 설치 (원클릭)

### 5-1. 프로젝트 파일 전송

**방법 A: Git으로 가져오기** (추천)

```bash
# 서버에서 실행
sudo apt install -y git
git clone https://github.com/groove1027/all-in-one-production.git
cd all-in-one-production/server
```

**방법 B: 파일 직접 전송** (Git 안 쓸 경우)

로컬 터미널(내 맥)에서:
```bash
# server 폴더만 VPS로 전송
scp -i ~/Downloads/ssh-key-2026-xx-xx.key -r server/ ubuntu@140.238.xx.xx:~/server/
```

VPS에서:
```bash
cd ~/server
```

### 5-2. 설치 스크립트 실행

```bash
sudo bash install.sh
```

설치 과정 (자동):
```
[1/7] 시스템 업데이트 중...
[2/7] Node.js 20 LTS 설치 중...
[3/7] yt-dlp 설치 중...
[4/7] 앱 디렉토리 설정 중...
  API 키가 자동 생성되었습니다.
  키: a1b2c3d4e5f6...   ← 이 키를 꼭 메모하세요!
[5/7] systemd 서비스 등록 중...
[6/7] 방화벽 설정 중...
[7/7] yt-dlp 자동 업데이트 cron 등록 중...

========================================
  설치 완료!
========================================
```

### 5-3. 설치 확인

```bash
# 서버 상태 확인
systemctl status ytdlp-api

# API 테스트 (서버 내부에서)
curl http://localhost:3100/health
```

예상 응답:
```json
{"status":"ok","version":"1.0.0","activeRequests":0,"cacheSize":0,"uptime":5}
```

### 5-4. 외부에서 테스트

내 맥 터미널에서:
```bash
# IP 직접 접속 테스트
curl http://140.238.xx.xx:3100/health

# 영상 URL 추출 테스트 (API_KEY를 설치 시 생성된 키로 변경)
curl -H "X-API-Key: a1b2c3d4e5f6..." \
  "http://140.238.xx.xx:3100/api/extract?url=dQw4w9WgXcQ&quality=360p"
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

---

## 6단계: Cloudflare 설정 (도메인 + CDN + 보안)

### 왜 Cloudflare를 쓰나요?

1. **무료 HTTPS** — 인증서 자동 발급
2. **DDoS 보호** — 공격 차단
3. **서버 IP 숨김** — 실제 IP 노출 방지
4. **무료 트래픽** — API 응답(JSON)은 무제한

### 6-1. Cloudflare 가입 & 도메인 추가

1. https://cloudflare.com 에서 가입
2. **「Add a site」** → 도메인 입력 (예: `myvideoapi.com`)

   > 도메인이 없다면? `Namecheap`이나 `가비아`에서 `.com` 도메인 구매 (연 약 1만원)
   > 무료 대안: Cloudflare 자체 무료 도메인은 없지만, 기존 도메인이 있으면 무료로 사용 가능

3. **Plan**: **Free** 선택
4. **DNS records** 화면에서 아래처럼 설정:

### 6-2. DNS 레코드 추가

| Type | Name | Content | Proxy status |
|------|------|---------|-------------|
| A | `api` | `140.238.xx.xx` (VPS IP) | ✅ Proxied (주황색 구름) |

> `api.myvideoapi.com` 으로 API에 접속하게 됩니다.

### 6-3. 네임서버 변경

Cloudflare가 알려주는 **2개의 네임서버**를 도메인 구매처에서 변경:

예시:
```
ns1: donna.ns.cloudflare.com
ns2: larry.ns.cloudflare.com
```

도메인 구매처(가비아, Namecheap 등) → DNS 설정 → 네임서버를 위 값으로 변경

> 반영까지 최대 24시간 걸릴 수 있지만, 보통 5~30분 내 완료됩니다.

### 6-4. SSL/TLS 설정

Cloudflare 대시보드 → **SSL/TLS** 메뉴:
- **Encryption mode**: **「Full」** 선택

### 6-5. (선택) Page Rules — API 캐시 방지

Cloudflare 대시보드 → **Rules** → **Page Rules**:
- URL: `api.myvideoapi.com/api/*`
- Setting: **Cache Level** = **Bypass**

> 영상 URL은 시간이 지나면 만료되므로 캐싱하면 안 됩니다.

### 6-6. 확인

```bash
# HTTPS로 접속 테스트
curl https://api.myvideoapi.com/health
```

---

## 7단계: VPS에서 ALLOWED_ORIGINS 설정

서버가 우리 앱에서만 요청을 받도록 설정합니다.

```bash
# VPS에 SSH 접속 후
sudo nano /opt/ytdlp-api/.env
```

`ALLOWED_ORIGINS` 줄을 수정:
```
ALLOWED_ORIGINS=https://your-app-domain.com
```

저장: `Ctrl+O` → `Enter` → `Ctrl+X`

서버 재시작:
```bash
sudo systemctl restart ytdlp-api
```

---

## 8단계: 프론트엔드 연동

### 8-1. 앱 설정 화면에서 서버 주소 입력

앱의 설정에서:
- **서버 주소**: `https://api.myvideoapi.com`
- **API 키**: 5단계에서 생성된 키

이 값들은 `localStorage`에 저장됩니다:
- `YTDLP_API_URL` = `https://api.myvideoapi.com`
- `YTDLP_API_KEY` = `a1b2c3d4e5f6...`

### 8-2. 코드에서 사용 (이미 구현됨)

```typescript
import { extractStreamUrl, downloadVideoAsBlob } from './services/ytdlpApiService';

// URL만 추출
const result = await extractStreamUrl('https://youtube.com/watch?v=xxx', '720p');
console.log(result.url); // googlevideo.com URL

// Blob으로 직접 다운로드
const { blob, info } = await downloadVideoAsBlob(
  'https://youtube.com/watch?v=xxx',
  '720p',
  (progress) => console.log(`${Math.round(progress * 100)}%`)
);
```

---

## 유지보수

### 자주 쓰는 명령어

```bash
# 서버 상태 확인
sudo systemctl status ytdlp-api

# 실시간 로그 보기
sudo journalctl -u ytdlp-api -f

# 서버 재시작
sudo systemctl restart ytdlp-api

# yt-dlp 수동 업데이트
sudo pip3 install -U yt-dlp
sudo systemctl restart ytdlp-api

# yt-dlp 현재 버전 확인
yt-dlp --version

# API 키 변경
sudo nano /opt/ytdlp-api/.env
# API_KEY=새로운키 로 변경 후 저장
sudo systemctl restart ytdlp-api

# 캐시 / 메모리 상태
curl http://localhost:3100/health
```

### yt-dlp 자동 업데이트

- **매일 새벽 4시**에 자동으로 최신 버전으로 업데이트됩니다
- 업데이트 후 서버도 자동 재시작됩니다
- 로그 확인: `cat /var/log/ytdlp-update.log`

### 문제 해결

#### "서버 접속이 안 돼요"
1. VPS가 실행 중인지 확인: Oracle Cloud 콘솔에서 인스턴스 상태 확인
2. 서비스가 실행 중인지: `sudo systemctl status ytdlp-api`
3. 방화벽 확인: `sudo ufw status`
4. Oracle Security List에서 포트가 열려있는지 확인 (3단계 참고)

#### "URL 추출이 실패해요"
1. yt-dlp 버전 확인: `yt-dlp --version`
2. 수동 테스트: `yt-dlp -f "bestvideo[height<=360][vcodec^=avc1]+bestaudio" --get-url "https://youtube.com/watch?v=dQw4w9WgXcQ"`
3. 업데이트: `sudo pip3 install -U yt-dlp && sudo systemctl restart ytdlp-api`

#### "429 Too Many Requests"
- 분당 30회 제한에 걸린 경우입니다
- 1분 기다리면 자동으로 풀립니다
- 제한 조정: `.env`에서 rate limit 관련 설정은 코드에서 수정 필요

#### "서버 메모리가 부족해요"
- `htop` 명령어로 메모리 확인
- yt-dlp 프로세스가 쌓여있으면: `sudo systemctl restart ytdlp-api`

---

## 비용 정리

| 항목 | 비용 |
|------|------|
| Oracle Cloud VPS | **무료** (Always Free Tier) |
| Oracle 트래픽 (월 10TB) | **무료** |
| Cloudflare CDN + DNS | **무료** (Free Plan) |
| 도메인 | 연 ~1만원 (이미 있으면 무료) |
| **총 월 비용** | **0원** |

---

## 아키텍처 Q&A

**Q: Oracle 트래픽이 무료인데 왜 Cloudflare를 쓰나요?**
A: 보안(DDoS 방어, 서버 IP 숨김) + 무료 HTTPS + CDN 속도 향상 때문입니다.

**Q: 영상을 서버로 프록시하면 트래픽이 많이 나가지 않나요?**
A: 서버는 URL(텍스트)만 반환합니다. 실제 영상은 브라우저가 YouTube CDN에서 직접 받으므로 서버 트래픽은 거의 0입니다.

**Q: YouTube가 yt-dlp를 차단하면?**
A: yt-dlp 커뮤니티가 매우 활발해서 차단되면 보통 1~3일 내에 업데이트됩니다. 자동 업데이트 cron이 매일 최신 버전을 받아옵니다.

**Q: Cobalt는 완전히 안 쓰나요?**
A: 프론트엔드에서 자체 서버 우선 → Cobalt 폴백 구조로 사용할 수 있습니다. 자체 서버가 다운됐을 때 보험용으로 유지하면 좋습니다.
