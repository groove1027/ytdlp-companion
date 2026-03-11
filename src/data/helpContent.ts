// 탭별 도움말 콘텐츠 데이터
import { AppTab } from '../types';

export interface HelpSection {
  title: string;
  description: string;
  steps?: string[];
  tips?: string[];
}

export interface TabHelpContent {
  tabName: string;
  icon: string;
  summary: string;
  sections: HelpSection[];
}

export const TAB_HELP: Record<string, TabHelpContent> = {
  'project': {
    tabName: '프로젝트',
    icon: '📁',
    summary: '영상 프로젝트를 만들고 관리하는 홈 화면이에요.',
    sections: [
      {
        title: '새 프로젝트 만들기',
        description: '좌측 상단의 "새 프로젝트" 버튼을 클릭하면 새 영상 프로젝트를 시작할 수 있어요.',
        steps: [
          '"새 프로젝트" 버튼 클릭',
          '영상 주제, 스타일, 비율 등 기본 설정 입력',
          '"다음" 버튼으로 대본 작성 단계로 이동',
        ],
      },
      {
        title: '기존 프로젝트 관리',
        description: '프로젝트 카드를 클릭하면 해당 프로젝트를 열 수 있어요.',
        tips: [
          '카드 우측 메뉴(⋮)로 이름 변경, 복제, 삭제 가능',
          '프로젝트는 자동 저장되므로 별도 저장 불필요',
          '프로젝트 내보내기/가져오기로 백업 가능',
        ],
      },
    ],
  },
  'channel-analysis': {
    tabName: '채널/영상 분석',
    icon: '🔍',
    summary: '유튜브 채널과 키워드를 AI로 분석해서 영상 전략을 수립해요.',
    sections: [
      {
        title: '채널 분석',
        description: '유튜브 채널 URL을 입력하면 AI가 채널의 스타일, 톤, 타겟 등을 분석해줘요.',
        steps: [
          '"채널 분석" 서브탭 선택',
          '유튜브 채널 URL 또는 채널명 입력',
          '"분석 시작" 클릭 → AI가 채널 DNA 분석',
        ],
        tips: [
          '분석 결과를 "프리셋으로 저장"하면 대본 작성 시 활용 가능',
          '여러 채널을 분석해서 비교 가능',
        ],
      },
      {
        title: '키워드/영상 분석',
        description: '검색 키워드를 입력하면 관련 인기 영상들을 분석해줘요.',
        steps: [
          '"키워드 분석" 서브탭 선택',
          '검색할 키워드 입력 (예: "먹방", "브이로그")',
          '인기 영상의 제목, 조회수, 패턴 등을 한눈에 확인',
        ],
      },
    ],
  },
  'script-writer': {
    tabName: '대본작성',
    icon: '✍️',
    summary: 'AI가 장면별 대본을 자동 생성하거나, 직접 작성할 수 있어요.',
    sections: [
      {
        title: 'AI 대본 생성',
        description: '주제만 입력하면 AI가 장면별 대본을 자동으로 만들어줘요.',
        steps: [
          '"AI 생성" 모드 선택',
          '영상 주제, 분위기, 길이 등 설정',
          '"대본 생성" 클릭 → AI가 장면 분할 + 대본 작성',
        ],
        tips: [
          '채널 분석 프리셋을 적용하면 채널 스타일에 맞는 대본 생성',
          '생성된 대본은 장면별로 수정/삭제/추가 가능',
          '각 장면의 이미지 프롬프트도 자동 생성됨',
        ],
      },
      {
        title: '직접 입력 모드',
        description: '이미 대본이 있다면 직접 붙여넣기 하세요.',
        steps: [
          '"직접 입력" 모드 선택',
          '대본 텍스트 붙여넣기',
          '"장면 분할" 클릭 → AI가 자동으로 장면 나눔',
        ],
      },
    ],
  },
  'sound-studio': {
    tabName: '사운드스튜디오',
    icon: '🎵',
    summary: '배경음악(BGM), 나레이션(TTS), 효과음을 만들고 관리해요.',
    sections: [
      {
        title: '나레이션 (TTS)',
        description: '대본을 자연스러운 AI 음성으로 변환해요.',
        steps: [
          '"나레이션" 서브탭 선택',
          '목소리 선택 (남/여, 톤 등)',
          '장면별 또는 전체 대본 → 음성 생성',
        ],
        tips: [
          '장면마다 다른 목소리를 지정할 수 있어요 (멀티 캐릭터)',
          '속도, 감정 등 세부 조절 가능',
        ],
      },
      {
        title: '배경음악 (BGM)',
        description: 'AI로 영상에 어울리는 배경음악을 생성해요.',
        steps: [
          '"BGM" 서브탭 선택',
          '분위기, 장르 등 설정',
          '"생성" 클릭 → AI가 맞춤 BGM 제작',
        ],
      },
      {
        title: '효과음 (SFX)',
        description: '장면별 효과음을 추가해요.',
        tips: [
          '밈/효과음 라이브러리에서 선택 가능',
          '장면에 드래그하여 적용',
        ],
      },
    ],
  },
  'image-video': {
    tabName: '이미지/영상',
    icon: '🎬',
    summary: '장면별 이미지를 AI로 생성하고, 영상으로 변환해요.',
    sections: [
      {
        title: '이미지 생성',
        description: '각 장면의 대본/프롬프트를 기반으로 AI 이미지를 생성해요.',
        steps: [
          '장면 카드에서 "이미지 생성" 클릭',
          'AI가 대본에 맞는 이미지 자동 생성',
          '마음에 안 들면 "재생성" 가능',
        ],
        tips: [
          '"일괄 생성" 버튼으로 전체 장면 한번에 생성 가능',
          '이미지 모델 변경 가능 (설정에서)',
          '생성된 이미지를 클릭하면 크게 볼 수 있어요',
        ],
      },
      {
        title: '영상 생성',
        description: '이미지를 기반으로 짧은 AI 영상 클립을 생성해요.',
        steps: [
          '이미지 생성 완료 후 "영상 생성" 클릭',
          'AI가 이미지에 모션을 추가한 영상 제작',
          '영상 엔진 선택 가능 (Grok, Veo 등)',
        ],
      },
    ],
  },
  'edit-room': {
    tabName: '편집실',
    icon: '✂️',
    summary: '생성된 영상 클립을 타임라인에서 편집하고, 자막/효과를 추가해요.',
    sections: [
      {
        title: '타임라인 편집',
        description: '영상 클립, 나레이션, BGM을 타임라인에 배치하고 편집해요.',
        steps: [
          '장면 카드를 타임라인에 드래그',
          '클립 길이 조절, 순서 변경',
          '미리보기로 확인',
        ],
      },
      {
        title: '자막 추가',
        description: '자막 스타일을 설정하고 영상에 자동 배치해요.',
        tips: [
          '자막 템플릿으로 빠르게 스타일 적용',
          '위치, 크기, 색상 등 세부 조절 가능',
          '나레이션 타이밍에 자동 싱크',
        ],
      },
      {
        title: '영상 내보내기',
        description: '완성된 영상을 파일로 다운로드해요.',
        steps: [
          '"내보내기" 버튼 클릭',
          '해상도, 포맷 선택',
          '렌더링 완료 후 자동 다운로드',
        ],
      },
    ],
  },
  'upload': {
    tabName: '업로드',
    icon: '📤',
    summary: '완성된 영상을 유튜브에 직접 업로드해요.',
    sections: [
      {
        title: '유튜브 업로드',
        description: '제목, 설명, 태그 등을 설정하고 바로 업로드할 수 있어요.',
        steps: [
          '영상 파일 선택 또는 편집실에서 자동 연결',
          '제목, 설명, 태그, 카테고리 입력',
          '"업로드" 클릭',
        ],
        tips: [
          'AI가 제목/설명/태그를 자동 추천해줘요',
          '예약 업로드 설정 가능',
        ],
      },
    ],
  },
  'thumbnail-studio': {
    tabName: '썸네일 스튜디오',
    icon: '🖼️',
    summary: '영상 썸네일을 AI로 생성하거나 직접 디자인해요.',
    sections: [
      {
        title: '썸네일 만들기',
        description: 'AI로 눈에 띄는 썸네일을 자동 생성해요.',
        steps: [
          '영상 주제/키워드 입력',
          '스타일 선택',
          '"생성" 클릭 → AI가 썸네일 제작',
        ],
        tips: [
          '텍스트 오버레이 추가 가능',
          '생성된 썸네일 직접 편집 가능',
        ],
      },
    ],
  },
  'character-twist': {
    tabName: '캐릭터 비틀기',
    icon: '🌀',
    summary: '기존 캐릭터를 다양한 스타일로 변형해요.',
    sections: [
      {
        title: '캐릭터 변형',
        description: '캐릭터 이미지를 업로드하면 다양한 스타일로 변형해줘요.',
        steps: [
          '원본 캐릭터 이미지 업로드',
          '변형 스타일 선택 (만화풍, 픽셀아트, 수채화 등)',
          '"변형" 클릭 → AI가 새로운 버전 생성',
        ],
      },
    ],
  },
  'image-script-upload': {
    tabName: '소스 임포트',
    icon: '📸',
    summary: '외부에서 만든 이미지나 대본을 가져와서 프로젝트에 적용해요.',
    sections: [
      {
        title: '이미지 가져오기',
        description: '직접 만든 이미지를 장면에 적용할 수 있어요.',
        steps: [
          '이미지 파일 선택 또는 드래그앤드롭',
          '적용할 장면 선택',
          '이미지 자동 배치',
        ],
      },
      {
        title: '대본 가져오기',
        description: '외부에서 작성한 대본 파일을 가져올 수 있어요.',
        tips: [
          '텍스트 파일(.txt) 지원',
          '가져온 대본은 자동으로 장면 분할',
        ],
      },
    ],
  },
  'ppt-master': {
    tabName: 'PPT 마스터',
    icon: '📊',
    summary: 'PPT/PDF 파일을 영상으로 자동 변환해요.',
    sections: [
      {
        title: 'PPT → 영상 변환',
        description: '프레젠테이션 파일을 업로드하면 AI가 영상으로 만들어줘요.',
        steps: [
          'PPT 또는 PDF 파일 업로드',
          '슬라이드별 자동 장면 분할',
          '나레이션 + 영상 자동 생성',
        ],
      },
    ],
  },
  'detail-page': {
    tabName: '쇼핑콘텐츠',
    icon: '🛒',
    summary: '상품 상세페이지나 쇼핑 숏폼 콘텐츠를 AI로 제작해요.',
    sections: [
      {
        title: '쇼핑 콘텐츠 만들기',
        description: '상품 정보를 입력하면 AI가 매력적인 콘텐츠를 만들어줘요.',
        steps: [
          '상품 URL 또는 정보 입력',
          '콘텐츠 유형 선택 (상세페이지, 숏폼 등)',
          '"생성" 클릭 → AI가 콘텐츠 제작',
        ],
      },
    ],
  },
  'subtitle-remover': {
    tabName: '자막/워터마크 제거',
    icon: '🧹',
    summary: '영상에서 기존 자막이나 워터마크를 AI로 깔끔하게 제거해요.',
    sections: [
      {
        title: '자막/워터마크 제거',
        description: '영상을 업로드하면 AI가 자막이나 워터마크를 제거해줘요.',
        steps: [
          '영상 파일 업로드',
          '제거할 영역 선택 (자동 감지 또는 수동)',
          '"제거" 클릭 → AI 처리',
        ],
      },
    ],
  },
};

// 온보딩 투어 스텝 데이터
export interface TourStep {
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export const ONBOARDING_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="new-project"]',
    title: '1. 새 프로젝트',
    description: '여기서 새 영상 프로젝트를 시작하세요. 주제, 스타일, 비율 등을 설정할 수 있어요.',
    position: 'right',
  },
  {
    targetSelector: '[data-tour="tab-channel-analysis"]',
    title: '2. 채널/영상 분석',
    description: '유튜브 채널을 AI로 분석해서 영상 전략을 세울 수 있어요.',
    position: 'right',
  },
  {
    targetSelector: '[data-tour="tab-script-writer"]',
    title: '3. 대본 작성',
    description: 'AI가 장면별 대본을 자동으로 만들어줘요. 직접 입력도 가능!',
    position: 'right',
  },
  {
    targetSelector: '[data-tour="post-production"]',
    title: '4. 후반작업',
    description: '사운드, 이미지/영상, 편집, 업로드까지 한번에 처리해요.',
    position: 'right',
  },
  {
    targetSelector: '[data-tour="toolbox"]',
    title: '5. 도구모음',
    description: '썸네일, 캐릭터 변형, PPT 변환 등 다양한 부가 도구가 있어요.',
    position: 'right',
  },
  {
    targetSelector: '[data-tour="help-button"]',
    title: '6. 도움말',
    description: '언제든 이 버튼을 누르면 현재 탭의 사용법을 볼 수 있어요!',
    position: 'bottom',
  },
];

export const TOUR_STORAGE_KEY = 'onboarding-tour-completed';
