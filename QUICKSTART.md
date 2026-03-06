# 🚀 Claude Code 시작 가이드

## 이 폴더의 파일들을 프로젝트에 넣는 방법

### 1단계: 프로젝트 폴더 준비

```bash
# 새 폴더 만들기
mkdir all-in-one-production
cd all-in-one-production

# 압축 파일의 소스 코드를 src/에 풀기
# (zip 파일의 내용이 src/ 폴더에 들어가도록)
```

### 2단계: 이 문서 패키지 복사

아래 파일/폴더들을 프로젝트 루트에 복사하세요:

```
all-in-one-production/
├── CLAUDE.md              ← 복사
├── .claude/               ← 폴더 전체 복사
│   ├── settings.json      ← 훅 설정 (자동 매뉴얼 + 품질 검사)
│   └── skills/            ← 스킬 매뉴얼 5개
├── docs/                  ← 폴더 전체 복사
│   ├── PLAN.md
│   ├── CONTEXT.md
│   ├── CHECKLIST.md
│   ├── BUG_REPORT.md      ← ★ 여기에 버그 작성
│   ├── FEATURE_REQUEST.md ← ★ 여기에 기능 요구사항 작성
│   └── ACCEPTANCE_CRITERIA.md
└── src/                   ← 기존 소스 코드
    ├── App.tsx
    ├── types.ts
    └── ...
```

### 3단계: Git 초기화

```bash
git init
git add -A
git commit -m "chore: initial commit with Claude Code system"
```

### 4단계: Claude Code 시작

```bash
# Claude Code 실행
claude

# 첫 번째 지시:
> CLAUDE.md 읽고, docs/PLAN.md와 docs/CHECKLIST.md를 확인해.
> 현재 상황을 파악하고 다음에 할 일을 알려줘.
```

---

## 💡 Claude Code 사용 핵심 규칙

### ✅ 이렇게 하세요

```
# 작업 시작 전 - 항상 계획 먼저
> 이 기능을 추가하려고 해. 먼저 계획을 세워봐.
> (계획 확인 후) 좋아, 이 계획을 docs/PLAN.md에 저장해.

# 한 번에 1~2개만
> 먼저 BUG-001만 수정해. 끝나면 CHECKLIST 업데이트해.

# 중간 확인
> 방금 수정한 거 체크하고, 다음 할 일 정리해.

# 새 대화 시작 시
> docs/PLAN.md, docs/CHECKLIST.md 읽고 이어서 작업해.
```

### ❌ 이렇게 하지 마세요

```
# 한번에 다 시키기
> 버그 10개 다 고치고, 새 기능 3개 추가하고, 리팩토링도 해.

# 모호한 지시
> 알아서 해.
> 잘 만들어줘.

# 계획 없이 바로 실행
> 이거 바로 구현해.
```

---

## 📝 당신이 해야 할 일

### 지금 바로

1. **`docs/BUG_REPORT.md`를 열고** — Google AI Studio에서 안 됐던 기능들을 적어주세요
2. **`docs/FEATURE_REQUEST.md`를 열고** — 추가하고 싶은 기능을 적어주세요

### 그 다음

3. Claude Code에게 "BUG_REPORT.md 읽고 BUG-001부터 수정해" 라고 지시
4. 수정 완료 → 직접 테스트 → 다음 버그로
5. 버그 다 끝나면 "FEATURE_REQUEST.md 읽고 FEAT-001 구현해" 라고 지시

---

## 🔧 시스템 구성 요약 (영상에서 배운 4대 시스템)

| 시스템 | 구현 위치 | 역할 |
|--------|----------|------|
| 1. 자동 매뉴얼 | `.claude/settings.json` + `.claude/skills/` | 작업 전 관련 매뉴얼 자동 활성화 |
| 2. 작업 기억 | `docs/PLAN.md` + `CONTEXT.md` + `CHECKLIST.md` | AI 기억력 보완 |
| 3. 품질 검사 | `.claude/settings.json` PostToolUse 훅 | 작업 후 자동 체크 |
| 4. 전문 에이전트 | `.claude/skills/` 5개 분야별 매뉴얼 | 역할별 전문 지식 |
