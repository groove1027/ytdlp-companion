# 스킬: 내보내기 시스템 (HTML Export, ZIP 다운로드, 프롬프트 가이드)

> **활성화 조건**: "내보내기", "export", "HTML", "다운로드", "ZIP", "저장" 키워드 또는 `handleExport*`, `handleDownload*` 함수 수정 시

---

## 📂 담당 코드 (현재 App.tsx 내 인라인)

| 함수 | 위치 | 기능 |
|------|------|------|
| `handleExportHtml()` | App.tsx | 프로젝트 전체 HTML 내보내기 (400줄+) |
| `handleDownloadImages()` | App.tsx | 이미지 ZIP 다운로드 |
| `handleDownloadVideos()` | App.tsx | 영상 ZIP 다운로드 (CORS 우회 포함) |
| `handleDownloadThumbnails()` | App.tsx | 썸네일 ZIP 다운로드 |
| `handleExportVisualPromptsHtml()` | App.tsx | 비주얼 프롬프트 가이드 HTML |
| `handleExportVideoPromptsHtml()` | App.tsx | 영상 프롬프트 가이드 HTML |
| `downloadPromptGuideHtml()` | App.tsx | 프롬프트 가이드 HTML 생성 헬퍼 |
| `convertBase64ToJpg()` | App.tsx | PNG→JPG 70% 품질 변환 |

## ⚠️ 규칙

1. **HTML 내보내기 파일은 독립 실행 가능해야 함** (외부 의존: Tailwind CDN, JSZip CDN, Pretendard 폰트만)
2. **프로젝트 데이터는 `<script id="project-data">` 태그에 JSON으로 임베딩**
3. **이미지는 JPG 70% 품질로 변환하여 파일 크기 축소** (캐릭터 PNG는 투명도 유지를 위해 변환 안 함)
4. **영상 다운로드 실패 시 3회 재시도 후 텍스트 파일로 대체**

## 🔄 HTML Import 흐름

```
사용자가 .html 파일 업로드
  → DOMParser로 파싱
  → <script id="project-data"> 또는 <script> 내 projectData 변수 검색
  → JSON.parse() → handleLoadProject()
```

## 🎯 수정 시 체크포인트

- [ ] 내보낸 HTML을 브라우저에서 독립 실행 가능한지 확인
- [ ] 내보낸 HTML을 다시 가져올 수 있는지 확인 (양방향)
- [ ] ZIP 다운로드 시 진행률 표시 동작 확인
- [ ] CORS 우회 프록시(Cloudinary) 동작 확인
