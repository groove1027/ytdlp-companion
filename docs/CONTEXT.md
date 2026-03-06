# 📖 CONTEXT.md — 맥락 노트

> **이 파일은 "왜 이렇게 결정했는지"를 기록하는 장소입니다.**
> 설계 결정, 트레이드오프, 참고 자료를 여기에 남깁니다.

---

## 🏗️ 아키텍처 결정 기록

### 왜 이 앱이 Google AI Studio에서 만들어졌나?
- Google AI Studio의 웹앱 빌더 기능을 활용하여 프로토타이핑
- 하지만 AI Studio가 코드를 제멋대로 수정하고 기능을 누락시키는 문제 발생
- Claude Code로 전환하여 안정적인 개발 환경 확보

### 왜 전역 상태 관리가 없나?
- 원래 프로토타입으로 시작했기 때문에 useState만으로 시작
- 기능이 계속 추가되면서 App.tsx가 1,640줄로 비대해짐
- → Zustand 도입 예정

### 왜 API 키를 localStorage에 저장하나?
- 서버리스 구조 (백엔드 없음). 모든 API 호출이 클라이언트에서 직접 발생
- 사용자별 API 키 사용 (공유 키 아님)
- → 보안 개선은 향후 과제 (서버 프록시 도입 등)

### 왜 Laozhang/Kie/Apimart 여러 API를 사용하나?
- 각 API 서비스마다 가격과 품질이 다름
- Laozhang: Gemini 프록시로 가장 저렴, 분석용으로 사용
- Kie: Grok 영상 생성, 빠르지만 비쌈
- Apimart: Veo 3.1 1080p 최고 화질, 가장 저렴($0.08)하지만 느리고 검열 엄격
- → 사용자가 품질/가격/속도를 선택할 수 있도록 3종 모델 제공

### 왜 이미지가 Base64로 저장되나?
- Google AI Studio 환경에서 외부 파일 시스템 접근이 제한적이었음
- IndexedDB에 프로젝트 데이터와 함께 저장하기 위해 Base64 사용
- → 메모리 이슈의 원인. Blob Storage로 전환 검토

### 왜 HTML로 내보내기를 하나?
- 프로젝트 데이터 + 이미지 + 뷰어를 하나의 파일로 공유 가능
- 별도 서버 없이도 결과물 전달 가능
- 다시 앱으로 가져오기도 가능 (양방향)

---

## 🔗 외부 API 참고 정보

### Laozhang AI
- OpenAI-compatible API 형식 사용
- 모델명: `gemini-3-pro-image-preview` (채팅/이미지 분석)
- 이미지 생성: 별도 엔드포인트
- 한국어 프롬프트 지원

### Kie AI
- 자체 API 형식 + Google Veo API 래핑
- Grok 영상: `POST /jobs` → 폴링 `GET /jobs/recordInfo?taskId=`
- 스피치 모드: 한국어 대사 자동 생성

### Apimart
- Veo 3.1 래핑 서비스
- `POST /v1/videos/generations` → 태스크 ID 반환 → `GET /v1/tasks/{id}`
- 1080p 고화질, 검열이 엄격하여 일부 프롬프트 거부됨

---

## ⚡ 핵심 트레이드오프 기록

| 결정 | 장점 | 단점 | 대안 |
|------|------|------|------|
| CSR (클라이언트 렌더링) | 서버 불필요, 즉시 배포 | API 키 노출 | SSR 전환 |
| Base64 이미지 | 단일 파일 저장 가능 | 메모리 사용량 높음 | Blob + URL.createObjectURL |
| Tailwind CDN | 설정 간편 | 런타임 JIT 불가 | PostCSS 빌드 |
| alert() 에러 | 구현 간단 | UX 좋지 않음 | Toast 시스템 |
| 한국어 하드코딩 | 빠른 개발 | i18n 불가 | react-intl |

---

*마지막 업데이트: 초기 생성*
