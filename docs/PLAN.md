# 📋 PLAN.md — 현재 작업 계획서

> **이 파일은 AI의 외부 기억 장치입니다.**
> 새로운 대화를 시작할 때마다 이 파일을 먼저 읽으세요.
> 작업이 끝나면 반드시 이 파일을 업데이트하세요.

---

## 🎯 현재 프로젝트 목표

Google AI Studio에서 만들던 "All-in-One Production v3.1" 웹앱을 Claude Code 환경으로 마이그레이션하고, 기존에 제대로 작동하지 않던 기능을 수정하며, 새 기능을 추가한다.

## 📌 현재 Phase

**Phase 0: 환경 구축 및 현황 파악** (← 현재 여기)

## 🗺️ 전체 로드맵

### Phase 0: 환경 구축 🔄 거의 완료
- [x] 프로젝트 파일 확보 (v3.1)
- [x] 코드베이스 분석 완료 (11,123줄, 38파일)
- [x] CLAUDE.md 작성
- [x] 스킬 파일 작성 (5개)
- [x] 작업 기억 시스템 문서 작성 (PLAN/CONTEXT/CHECKLIST)
- [x] npm install 및 빌드 확인 (2026-02-23)
- [x] 개발 서버 실행 확인 (Vite v5.4.21, localhost:3000)
- [x] API 키 설정 완료 (apiService.ts DEFAULT 값)

### Phase 1: 버그 수정 (사용자 보고 대기)
- [ ] 사용자로부터 BUG_REPORT.md 작성 (어떤 기능이 안 되는지)
- [ ] 우선순위 정하기
- [ ] 버그 수정
- [ ] 수정 검증

### Phase 2: 아키텍처 개선
- [ ] Zustand 상태 관리 도입
- [ ] App.tsx 분해 (God Component 해소)
- [ ] geminiService.ts 모듈 분리
- [ ] Props Drilling 해소

### Phase 3: 새 기능 추가 (사용자 요구 대기)
- [ ] 사용자로부터 FEATURE_REQUEST.md 작성
- [ ] 기능 구현
- [ ] 검증

### Phase 4: 최적화
- [ ] 이미지 메모리 최적화 (Base64 → Blob)
- [ ] 코드 스플리팅
- [ ] 번들 크기 최적화

---

## ⏸️ 현재 멈춘 지점

환경 구축 거의 완료. `.env.local` API 키 설정만 남음.
사용자로부터 **"어떤 기능이 안 되는지"**와 **"어떤 기능을 추가하고 싶은지"** 입력 대기 중.

## 📝 다음에 할 일

1. (선택) `.env.local` 파일에 API 키 설정 — 실제 API 호출이 필요할 때
2. 사용자가 버그/기능 요구사항을 알려주면 BUG_REPORT.md와 FEATURE_REQUEST.md에 기록
3. 우선순위 정하기
4. 한 번에 1~2개씩 작업 시작

---

*마지막 업데이트: 2026-02-23 — 환경 구축 완료 (npm install, tsc, dev server)*
