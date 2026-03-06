# 스킬: 데이터 저장소 (IndexedDB, localStorage, 프로젝트 데이터)

> **활성화 조건**: "저장", "불러오기", "프로젝트", "IndexedDB", "localStorage" 키워드 또는 `services/storage*`, `services/apiService*` 파일 수정 시

---

## 📂 담당 파일

- `services/storageService.ts` (61줄) — IndexedDB CRUD
- `services/apiService.ts` (140줄) — API 키 관리 + monitoredFetch

## 🗄️ IndexedDB 스키마

```
DB명: 'ai-storyboard-v2'
Store: 'projects'
  Key: string (Project ID, e.g. 'proj_1719838400000')
  Value: ProjectData
최대: 10개 프로젝트
```

## 📦 ProjectData 구조

```typescript
interface ProjectData {
  id: string;
  title: string;
  config: ProjectConfig;    // 28개 설정 필드
  scenes: Scene[];          // 45+ 필드/씬
  thumbnails: Thumbnail[];  // 16개 필드/썸네일
  fullNarrationText: string;
  lastModified: number;     // Date.now() 타임스탬프
  costStats?: CostStats;
}
```

## 🔑 API 키 저장 (localStorage)

| 키 | getter | 용도 |
|----|--------|------|
| CUSTOM_KIE_KEY | `getKieKey()` | Kie AI |
| CUSTOM_LAOZHANG_KEY | `getLaozhangKey()` | Laozhang (+ Gemini 폴백) |
| CUSTOM_APIMART_KEY | `getApimartKey()` | Apimart |
| CUSTOM_REMOVE_BG_KEY | `getRemoveBgKey()` | Remove.bg |
| CUSTOM_CLOUD_NAME | `getCloudinaryConfig()` | Cloudinary |
| CUSTOM_UPLOAD_PRESET | `getCloudinaryConfig()` | Cloudinary |

**중요**: `getGeminiKey()`는 Kie 키 → Laozhang 키 순서로 폴백.
모든 키는 `sanitizeKey()`로 비ASCII 문자 제거.

## ⚠️ 규칙

1. **localStorage 직접 접근 금지**. 반드시 apiService.ts의 getter 사용.
2. **자동 저장은 2초 디바운스**. (App.tsx useEffect에서 처리)
3. **저장 데이터에 Base64 이미지 포함**. 대형 프로젝트에서 성능 주의.

## 🎯 수정 시 체크포인트

- [ ] 저장 후 불러오기 무결성 (모든 필드 복원 확인)
- [ ] 프로젝트 10개 제한 동작 확인
- [ ] API 키에 한국어/이모지 포함 시 sanitize 확인
