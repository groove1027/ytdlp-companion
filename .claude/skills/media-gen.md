# 스킬: 미디어 생성 (VideoGenService, uploadService, imageProcessing)

> **활성화 조건**: "영상", "비디오", "Veo", "Grok", "이미지 업로드", "Cloudinary" 키워드 또는 `services/Video*`, `services/upload*`, `services/imageProcessing*`, `hooks/useVideoBatch*` 파일 수정 시

---

## 📂 담당 파일

- `services/VideoGenService.ts` (688줄) — 영상 생성 API 통합
- `services/uploadService.ts` (109줄) — Cloudinary 업로드
- `services/imageProcessingService.ts` (135줄) — Canvas 이미지 처리
- `services/removeBgService.ts` (59줄) — 배경 제거
- `hooks/useVideoBatch.ts` (460줄) — 배치 처리 훅

## ⚠️ 절대 규칙

1. **API 엔드포인트 URL을 변경하지 마라**:
   - Kie: `https://api.kie.ai/api/v1/jobs`
   - Laozhang: `https://api.laozhang.ai`
   - Apimart: `https://api.apimart.ai/v1/videos/generations`
2. **모든 fetch는 `monitoredFetch`를 사용하라**
3. **Base64 → File 변환 시 padding 보정 로직을 유지하라** (VideoGenService의 base64ToFile)

## 🎬 영상 생성 모델 3종

| 모델 | API | 해상도 | 가격 | 특징 |
|------|-----|--------|------|------|
| Grok HQ | Kie AI | 720p | $0.10~0.15 | 빠름, 6초/10초, 스피치 모드 |
| Veo 720p Fast | Laozhang | 720p | - | 레거시, 빠름 |
| Veo 3.1 1080p | Apimart | 1080p | $0.08 | 최고 화질, 느림, 검열 엄격 |

## 🔄 영상 생성 플로우

```
[이미지 URL 확보]
  → sanitizePrompt() : 프롬프트 정리
  → API 호출 (모델별 분기)
    → Grok: POST /jobs → 폴링 GET /jobs/recordInfo
    → Veo Fast: POST /v1/videos/generations → 폴링
    → Veo Quality: POST (Apimart) → 폴링 GET /v1/tasks/{id}
  → 결과 URL 반환
```

## 📦 useVideoBatch 훅 상태

```
isBatching: boolean        — 배치 실행 중
batchProgress: {current, total} — 진행률
detailedStatus: {percent, eta}  — 상세 상태
```

배치 함수: `runGrokHQBatch()`, `runVeoFastBatch()`, `runVeoQualityBatch()`
개별 함수: `runSingleGrok()`, `runSingleGrokHQ()`, `runSingleVeoFast()`, `runSingleVeoQuality()`
취소: `cancelScene(sceneId)`

## 🖼️ Cloudinary 업로드

- `uploadMediaToHosting(file)` — 파일 직접 업로드
- `uploadRemoteUrlToCloudinary(url)` — 원격 URL 프록시 (CORS 우회)
- `validateCloudinaryConnection(name, preset)` — 연결 테스트

## 🖼️ Laozhang 이미지 생성 API (nano-banana-pro) — 공식 문서 기반

> 출처: https://docs.laozhang.ai/en/api-capabilities/nano-banana-pro-image
> 출처: https://docs.laozhang.ai/en/api-capabilities/nano-banana-pro-image-edit

### 엔드포인트
```
POST https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent
Authorization: Bearer {API_KEY}
```

### 요청 형식 (Text-to-Image)
```json
{
  "contents": [{"parts": [{"text": "프롬프트"}]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"}
  }
}
```

### 요청 형식 (Image-to-Image / 편집) — Base64 입력
```json
{
  "contents": [{"parts": [
    {"text": "편집 지시"},
    {"inline_data": {"mime_type": "image/jpeg", "data": "BASE64_DATA"}}
  ]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {"aspectRatio": "1:1", "imageSize": "2K"}
  }
}
```

### 요청 형식 (Image-to-Image) — URL 입력
```json
{
  "contents": [{"parts": [
    {"fileData": {"fileUri": "https://example.com/image.png", "mimeType": "image/png"}},
    {"text": "편집 지시"}
  ]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {"aspectRatio": "16:9", "imageSize": "4K"}
  }
}
```

### 응답 형식 (camelCase!)
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inlineData": {"mimeType": "image/png", "data": "BASE64_IMAGE_DATA"}
      }]
    }
  }]
}
```

### ⚠️ 핵심 주의사항
- **요청**: Base64 이미지는 `inline_data` + `mime_type` (snake_case)
- **요청**: URL 이미지는 `fileData` + `fileUri` + `mimeType` (camelCase)
- **응답**: `inlineData` + `mimeType` (camelCase)
- **aspectRatio 옵션**: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9, 3:2, 2:3, 5:4, 4:5
- **imageSize 옵션**: "1K", "2K", "4K"
- **가격**: $0.05/장
- **파일 크기**: 권장 ≤5MB, 최대 10MB
- **다중 이미지**: 최대 14장 동시 입력

## 📚 외부 API 기술 문서 참조

> **모든 API의 완전한 기술 문서는 `.claude/skills/api-reference.md`에 정리되어 있음**
> API 엔드포인트, 요청/응답 포맷, 에러 코드, 가격 등 상세 정보 참조

## 🎯 수정 시 체크포인트

- [ ] 폴링 타임아웃 (현재 명시적 제한 없음 — 5분 제한 권장)
- [ ] 에러 시 폴백 모델 자동 시도 여부
- [ ] 영상 URL의 CORS 접근 가능 여부 확인
- [ ] Base64 이미지 → 공개 URL 변환 후 API 호출
- [ ] **요청 케이싱 확인**: Laozhang Base64=snake_case, URL=camelCase (api-reference.md §2-B 참조)
- [ ] **응답 파싱**: finishReason, promptFeedback.blockReason 체크
- [ ] **에러 코드 구별**: 402(잔액부족), 429(rate limit), 401(인증) 각각 처리
