# yt-dlp Companion (헬퍼 앱)

안정적이고 빠른 YouTube 다운로드를 위한 로컬 헬퍼 앱입니다.

## 지원 플랫폼

| 플랫폼 | 상태 | 설치 파일 |
|--------|------|-----------|
| macOS (Apple Silicon) | ✅ | `.dmg` |
| macOS (Intel) | ✅ | `.dmg` |
| Windows (x64) | ✅ | `.exe` (NSIS 인스톨러) |

## 구조

```
companion/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       ← Tauri 앱 진입점 (트레이 + 서버 시작)
│   │   ├── platform.rs   ← 플랫폼별 유틸리티 (python/pip 경로 등)
│   │   ├── server.rs     ← localhost:9876 API 서버 (axum)
│   │   ├── ytdlp.rs      ← yt-dlp 바이너리 관리 + 명령 실행
│   │   ├── rembg.rs       ← 배경 제거 (rembg)
│   │   ├── whisper.rs     ← 음성 인식 (whisper.cpp)
│   │   └── tts.rs         ← 음성 합성 (Kokoro/Piper)
│   ├── Cargo.toml
│   └── tauri.conf.json
└── dist/
    └── index.html         ← 미니멀 프론트엔드 (창 없음)
```

## 빌드

```bash
# 사전 요구: Rust + Cargo + Tauri CLI
cargo install tauri-cli --version "^2"

# macOS 빌드
cd companion/src-tauri
cargo tauri build

# Windows 빌드 (Windows 환경에서)
cd companion\src-tauri
cargo tauri build
# 결과: target/release/bundle/nsis/All-In-One-Helper_1.0.0_x64-setup.exe
```

## Windows 사전 요구사항

- Python 3.9+ (Microsoft Store 또는 python.org에서 설치)
- FFmpeg (선택 — `winget install ffmpeg` 또는 직접 설치)

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | `{ app: 'ytdlp-companion', status, version, ytdlpVersion }` |
| GET | `/api/extract?url=&quality=` | 스트림 URL 추출 |
| GET | `/api/download?url=&quality=` | 영상 다운로드 (바이너리) |
| POST | `/api/frames` | 프레임 추출 (ffmpeg) |
| POST | `/api/social/metadata` | 소셜 미디어 메타데이터 |
| POST | `/api/social/download` | 소셜 미디어 다운로드 |

## 웹앱 연동

웹앱(`ytdlpApiService.ts`)이 자동으로 `localhost:9876/health`를 감지합니다.
헬퍼가 실행 중이면 모든 다운로드가 로컬 yt-dlp로 직접 처리됩니다.
