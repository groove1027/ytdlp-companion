# ViMax 아키텍처 분석 — 우리 앱 적용 가이드

> **출처**: [github.com/HKUDS/ViMax](https://github.com/HKUDS/ViMax) (HKU Data Intelligence Lab)
> **작성일**: 2026-03-12
> **목적**: ViMax의 에이전트 기반 영상 제작 파이프라인을 분석하고, All-in-One Production 앱에 적용 가능한 기술을 정리

---

## 1. ViMax 개요

**"Director, Screenwriter, Producer, and Video Generator All-in-One"**

아이디어/소설/대본을 입력하면, 멀티 에이전트가 자동으로 시나리오 작성 → 스토리보드 설계 → 이미지 생성 → 영상 조립까지 전 과정을 처리하는 오픈소스 프레임워크.

### 4가지 모드
| 모드 | 설명 |
|------|------|
| **Idea2Video** | 단순 아이디어 → 전체 영상 스토리 |
| **Novel2Video** | 장편 소설 → 에피소드 형식 영상 |
| **Script2Video** | 사용자 대본 → 무제한 영상 생성 |
| **AutoCameo** | 사용자 사진 → 영상 내 캐릭터로 등장 |

### 기술 스택 (우리 앱과 동일!)
| 구성 요소 | ViMax | 우리 앱 |
|-----------|-------|---------|
| AI 텍스트 | Google Gemini 2.5 Flash | Gemini 3.1 Pro (Evolink) |
| 이미지 생성 | Nanobanana Google API | Nanobanana 2 (Evolink) |
| 영상 생성 | Veo Google API | Veo 3.1 (Evolink) |
| 언어 | Python 3.12 | TypeScript (React) |

---

## 2. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                    입력 레이어                         │
│  아이디어 / 대본 / 소설 / 레퍼런스 이미지 / 스타일      │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│               중앙 오케스트레이터                       │
│  에이전트 스케줄링 · 단계 전환 · 리소스 관리 · 재시도    │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Script   │→│Storyboard│→│ Visual   │→│ Quality  │
│ Agent    │  │ Agent    │  │ Agent    │  │ Agent    │
│          │  │          │  │          │  │          │
│ 대본 파싱 │  │ 샷 설계  │  │ 이미지   │  │ 일관성   │
│ 캐릭터   │  │ 카메라   │  │ 프롬프트  │  │ VLM 검증 │
│ 배경 추출 │  │ 연출 결정 │  │ 자동 생성 │  │ 최적 선택 │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
                                              ▼
                                    ┌──────────────────┐
                                    │  Assembly Agent   │
                                    │ 샷 병합 → 장면    │
                                    │ 장면 → 최종 영상  │
                                    └──────────────────┘
```

### 6개 전문 에이전트

| 에이전트 | 역할 | 입력 | 출력 |
|---------|------|------|------|
| **Script Agent** | 대본 파싱, 캐릭터/배경/액션 추출 | 텍스트 (아이디어/소설/대본) | 구조화된 장면 목록 + 캐릭터 DB |
| **Storyboard Agent** | 카메라 워크, 샷 타입, 감정 비트 분석 | 장면 목록 | 샷 리스트 (카메라/앵글/구도) |
| **Visual Agent** | 레퍼런스 선택, 프롬프트 자동 생성, 공간 배치 | 샷 리스트 + 캐릭터 DB | 이미지 생성 프롬프트 |
| **Quality Agent** | VLM으로 생성 이미지 평가, 캐릭터 일관성 검증 | 후보 이미지들 + 레퍼런스 | 최적 이미지 선택 |
| **Assembly Agent** | 연속 샷 병합, 전환 효과, 최종 영상 조립 | 최적 이미지 + 영상 클립 | 완성 영상 |
| **Coordinator Agent** | 전체 흐름 관리, 재시도, 글로벌 일관성 | 모든 에이전트 상태 | 파이프라인 제어 |

---

## 3. 핵심 기술 상세

### 3-1. RAG 기반 장편 대본 분할

**문제**: 소설/장편 대본이 토큰 한계를 초과
**해결**: Retrieval-Augmented Generation으로 청크 분할 + 핵심 플롯/대사 보존

```
장편 텍스트 (10만자)
  → 청크 분할 (장/절 기준)
  → 각 청크에서 핵심 플롯 포인트 추출
  → 캐릭터 등장/퇴장 트래킹
  → 장면 경계 자동 결정
  → 멀티씬 스크립트 생성 (플롯 연속성 보존)
```

**우리 앱 적용 포인트**:
- 현재 `parseScriptToScenes()`는 단일 Gemini 호출로 분할
- 긴 대본(3000자+)에서 장면 누락 발생 가능
- RAG 패턴으로 청크 분할 → 병렬 처리 → 결과 병합 가능

---

### 3-2. 시네마토그래피 언어 기반 자동 연출

**Storyboard Agent**가 대본의 감정 비트를 분석하여 카메라 워크를 자동 결정:

| 장면 유형 | 카메라 결정 | 이유 |
|-----------|-----------|------|
| 대화 (2인) | OTS (Over-the-Shoulder) + 정면 CU 교차 | 시선 교차로 긴장감 |
| 감정 고조 | ECU (Extreme Close-Up) + eye-level | 감정 몰입 극대화 |
| 액션/추격 | WS → 빠른 컷 + 낮은 앵글 | 역동성, 힘의 과시 |
| 장면 전환 | ES (Establishing Shot) + 고각도 | 공간 설정, 시간 경과 |
| 서스펜스 | Dutch angle + 좁은 DOF | 불안감, 초점 강조 |
| 회상/꿈 | 소프트 포커스 + 오버노출 | 비현실적 분위기 |

```
입력: "그녀는 창밖을 바라보며 조용히 눈물을 흘렸다."
      ↓ 감정 분석: sadness (high), intimacy (high)
      ↓ 자동 연출 결정:
출력: {
  shotType: "ECU",        // 극단적 클로즈업
  cameraAngle: "eye-level", // 눈높이
  dof: "shallow",          // 얕은 피사계 심도
  movement: "slow push-in", // 느린 전진
  lighting: "side-lit, warm", // 측면 조명
  mood: "melancholic"
}
```

**우리 앱 적용 포인트**:
- 현재 `shotSize`는 인덱스 기반 단순 로테이션 (WS→MS→CU→...)
- Gemini 프롬프트에 감정 분석 + 연출 결정 지시를 추가하면 즉시 구현 가능
- `parseScriptToScenes()` 결과에 `cameraAngle`, `cameraMovement`, `dof` 필드 추가

---

### 3-3. 지능형 레퍼런스 이미지 선택 (Reference Chaining)

**핵심 혁신**: 이전 장면의 생성된 이미지를 다음 장면의 레퍼런스로 사용

```
Scene 1: "카페에서 커피를 마시는 주인공"
  → 이미지 생성 → [결과물 A]

Scene 2: "카페를 나서는 주인공"
  → 레퍼런스: 캐릭터 원본 이미지 + [결과물 A]  ← 이전 장면 체이닝
  → 이미지 생성 → [결과물 B] (카페 배경 일관성 유지)

Scene 3: "거리를 걷는 주인공"
  → 레퍼런스: 캐릭터 원본 이미지 + [결과물 B]  ← 이전 장면 체이닝
  → 이미지 생성 → [결과물 C] (조명/색감 연속성 유지)
```

**선택 알고리즘**:
1. 현재 장면의 등장인물 목록 추출
2. 이전 장면들에서 동일 인물이 등장한 이미지 필터링
3. 가장 최근 + 가장 유사한 구도의 이미지 선택
4. 선택된 이미지를 Gemini 이미지 생성의 추가 레퍼런스로 주입

**우리 앱 적용 포인트**:
- `generateSceneImage()`에 `previousSceneImages?: string[]` 파라미터 추가
- 배치 생성 시 순차적으로 이전 결과를 다음 장면에 전달
- Nanobanana 2 API가 다중 레퍼런스 이미지를 지원하므로 즉시 적용 가능

---

### 3-4. 병렬 후보 생성 + VLM 최적 선택 (Best-of-N)

```
하나의 프롬프트 → 3개 후보 병렬 생성
                   ↓
              ┌─────────┐
              │ Quality  │
              │ Agent    │
              │ (VLM)    │
              └─────────┘
                   ↓
         Gemini VLM 평가 기준:
         1. 캐릭터 얼굴 일치도 (레퍼런스 vs 생성물)
         2. 프롬프트 핵심 요소 포함 여부
         3. 구도/라이팅 품질
         4. 이전 장면과의 연속성
                   ↓
         최고점 후보 자동 선택 → 사용자에게 표시
```

**평가 프롬프트 예시**:
```
다음 3개 이미지를 평가해주세요.
원본 프롬프트: "{visualPrompt}"
캐릭터 레퍼런스: [첨부]
이전 장면 이미지: [첨부]

각 이미지에 대해 1~10점으로 평가:
- character_accuracy: 캐릭터 외형 일치도
- prompt_adherence: 프롬프트 핵심 요소 반영도
- composition: 구도 및 라이팅 품질
- continuity: 이전 장면과의 시각적 연속성

JSON으로 응답: [{ "image": 1, "scores": {...}, "total": N }, ...]
```

**우리 앱 적용 포인트**:
- 비용 3~4배 증가 → 옵션으로 제공 ("고품질 모드" 토글)
- `generateSceneImage()` 내부에서 Promise.all로 3개 병렬 호출
- 결과를 Gemini VLM에 보내 평가 → 최고점 반환
- 실패율 대폭 감소 (1발 성공률 ~90%+)

---

### 3-5. 생성 후 일관성 검증 루프 (Quality Gate)

```
이미지 생성 → VLM 검증
              ↓
         일치도 >= 70%? → Yes → 채택
              ↓ No
         프롬프트 수정 + 재생성 (최대 2회)
              ↓
         2회 모두 실패 → 최선의 후보 채택 + 경고 표시
```

**검증 항목**:
1. **캐릭터 동일성**: 얼굴, 헤어, 의상이 레퍼런스와 일치하는가
2. **장면 요소**: 프롬프트에 명시된 물건/배경이 모두 있는가
3. **스타일 일관성**: 이전 장면과 색감/조명/화풍이 연속되는가
4. **텍스트 오류**: 의도하지 않은 텍스트가 이미지에 포함되었는가

**우리 앱 적용 포인트**:
- `generateSceneImage()` 반환 전에 Gemini VLM 검증 단계 추가
- 현재 `suppressText` 기능과 연계 — 텍스트 감지 시 자동 재생성
- 비용: Gemini Flash 1회 호출 추가 (~$0.001 미만)

---

## 4. ViMax vs 우리 앱 — GAP 분석

| 영역 | 우리 앱 (현재) | ViMax | GAP | 난이도 |
|------|--------------|-------|-----|--------|
| 대본 분할 | 단일 Gemini 호출 | RAG 청크 분할 | 장편 대본 누락 가능 | 중 |
| 카메라 연출 | 인덱스 로테이션 | 감정 비트 분석 자동 결정 | 단조로운 연출 | **하** |
| 장면 간 일관성 | 캐릭터 레퍼런스만 | 이전 장면 이미지 체이닝 | 배경/조명 불연속 | 중 |
| 이미지 품질 | 1장 생성 | N장 병렬 + VLM 선택 | 1발 실패 시 수동 재생성 | 중 |
| 품질 검증 | 없음 | VLM 자동 검증 + 재생성 | 품질 사용자 의존 | 중 |
| 캐릭터 일관성 | analysisResult 텍스트 | VLM 시각 비교 | 텍스트 한계 | 중 |

---

## 5. 구현 우선순위 로드맵

### Phase 1 (즉시 적용 가능) — 자동 연출
- `parseScriptToScenes()` 프롬프트에 시네마토그래피 분석 추가
- Scene 타입에 `cameraAngle`, `cameraMovement`, `depthOfField` 필드 추가
- 이미지 생성 프롬프트에 연출 정보 자동 주입
- **예상 작업량**: 프롬프트 수정 + types.ts 필드 추가

### Phase 2 (1~2일) — 레퍼런스 체이닝
- `generateSceneImage()`에 `previousSceneImage` 파라미터 추가
- 배치 생성 시 이전 장면 결과를 순차 전달
- Nanobanana 2 다중 레퍼런스 활용
- **예상 작업량**: imageGeneration.ts + StoryboardPanel + App.tsx

### Phase 3 (2~3일) — 품질 검증 루프
- 생성 후 Gemini Flash VLM 검증 호출
- 일치도 미달 시 자동 재생성 (최대 2회)
- 검증 결과 UI에 신뢰도 뱃지 표시
- **예상 작업량**: imageGeneration.ts + 검증 서비스 신규

### Phase 4 (옵션) — Best-of-N 병렬 생성
- "고품질 모드" 토글 UI 추가
- Promise.all로 3개 후보 병렬 생성
- VLM 평가 → 최적 선택
- **예상 작업량**: imageGeneration.ts + UI 토글 + 비용 표시

---

## 6. 참고 자료

- [ViMax GitHub](https://github.com/HKUDS/ViMax)
- [ViMax 아키텍처 분석 (Efficient Coder)](https://www.xugj520.cn/en/archives/vimax-agentic-video-generation.html)
- [ViMax 소개 (Medium)](https://medium.com/coding-nexus/vimax-the-future-of-agentic-video-generation-9b7d4dad4002)
- [ViMax 데모 영상 (YouTube)](https://www.youtube.com/@vimax-hkuds)

---

## 7. 설정 참조 (ViMax 원본)

```yaml
# configs/idea2video.yaml
chat_model: google/gemini-2.5-flash-lite-preview-09-2025
image_generator: tools.ImageGeneratorNanobananaGoogleAPI
video_generator: tools.VideoGeneratorVeoGoogleAPI
working_dir: .working_dir/idea2video

# API 키 설정
OPENROUTER_API_KEY: "..."
GOOGLE_API_KEY: "..."
```

```python
# main_idea2video.py (진입점)
# 1. config 로드
# 2. Script Agent → 대본 파싱
# 3. Storyboard Agent → 샷 설계
# 4. Visual Agent → 프롬프트 생성
# 5. Quality Agent → 이미지 검증
# 6. Assembly Agent → 영상 조립
```
