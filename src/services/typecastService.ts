/**
 * Typecast TTS Service
 * 한국어 특화 AI 음성 합성 — 감정 제어 + Smart 모드 (문맥 기반 자동 감정)
 * API: https://api.typecast.ai
 * 응답: 바이너리 오디오 (WAV/MP3) → blob URL 변환
 */

import { monitoredFetch, getTypecastKey } from './apiService';
import { logger } from './LoggerService';
import type { TypecastEmotionMode, TypecastEmotionPreset, TypecastModel } from '../types';

const TYPECAST_BASE_URL = 'https://api.typecast.ai';
const TYPECAST_MAX_CHARS = 2000;

// === Korean use_case tag mapping ===

const USE_CASE_KO: Record<string, string> = {
  'Audiobook': '오디오북',
  'E-learning': '교육',
  'Ads': '마케팅',
  'Podcast': '팟캐스트',
  'Conversational': '대화',
  'Game': '게임',
  'Anime': '애니메이션',
  'News': '뉴스',
  'Narration': '나레이션',
  'Kids': '아동',
  'Short-form': '숏폼 콘텐츠',
};

export const getKoreanUseCases = (useCases: string[]): string[] => {
  return useCases.map(uc => USE_CASE_KO[uc] || uc);
};

// === Types ===

export interface TypecastVoice {
  voice_id: string;
  name: string;
  gender: 'male' | 'female';
  age?: string;
  language: string[];
  models: string[];
  emotions: string[];
  use_cases: string[];
  preview_url?: string;
  image_url?: string;
}

export interface TypecastTTSOptions {
  voiceId: string;
  model?: TypecastModel;
  language?: string;
  emotionMode?: TypecastEmotionMode;
  emotionPreset?: TypecastEmotionPreset;
  emotionIntensity?: number;
  speed?: number;
  pitch?: number;
  volume?: number;
  audioFormat?: 'wav' | 'mp3';
  previousText?: string;
  nextText?: string;
}

export interface TypecastTTSResult {
  audioUrl: string;
  format: 'wav' | 'mp3';
}

// === Supported Languages (37개 언어) ===

export const TYPECAST_LANGUAGES: { code: string; name: string; nameKo: string; flag: string; label: string }[] = [
  { code: 'kor', name: 'Korean', nameKo: '한국어', flag: '🇰🇷', label: '한국어' },
  { code: 'eng', name: 'English', nameKo: '영어', flag: '🇺🇸', label: 'English' },
  { code: 'jpn', name: 'Japanese', nameKo: '일본어', flag: '🇯🇵', label: '日本語' },
  { code: 'zho', name: 'Chinese (Mandarin)', nameKo: '중국어', flag: '🇨🇳', label: '中文' },
  { code: 'yue', name: 'Cantonese', nameKo: '광동어', flag: '🇭🇰', label: '廣東話' },
  { code: 'spa', name: 'Spanish', nameKo: '스페인어', flag: '🇪🇸', label: 'Español' },
  { code: 'fra', name: 'French', nameKo: '프랑스어', flag: '🇫🇷', label: 'Français' },
  { code: 'deu', name: 'German', nameKo: '독일어', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'ita', name: 'Italian', nameKo: '이탈리아어', flag: '🇮🇹', label: 'Italiano' },
  { code: 'por', name: 'Portuguese', nameKo: '포르투갈어', flag: '🇧🇷', label: 'Português' },
  { code: 'rus', name: 'Russian', nameKo: '러시아어', flag: '🇷🇺', label: 'Русский' },
  { code: 'pol', name: 'Polish', nameKo: '폴란드어', flag: '🇵🇱', label: 'Polski' },
  { code: 'nld', name: 'Dutch', nameKo: '네덜란드어', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'tur', name: 'Turkish', nameKo: '터키어', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'ara', name: 'Arabic', nameKo: '아랍어', flag: '🇸🇦', label: 'العربية' },
  { code: 'hin', name: 'Hindi', nameKo: '힌디어', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'ben', name: 'Bengali', nameKo: '벵골어', flag: '🇧🇩', label: 'বাংলা' },
  { code: 'tha', name: 'Thai', nameKo: '태국어', flag: '🇹🇭', label: 'ไทย' },
  { code: 'vie', name: 'Vietnamese', nameKo: '베트남어', flag: '🇻🇳', label: 'Tiếng Việt' },
  { code: 'ind', name: 'Indonesian', nameKo: '인도네시아어', flag: '🇮🇩', label: 'Bahasa Indonesia' },
  { code: 'msa', name: 'Malay', nameKo: '말레이어', flag: '🇲🇾', label: 'Bahasa Melayu' },
  { code: 'tgl', name: 'Tagalog', nameKo: '타갈로그어', flag: '🇵🇭', label: 'Tagalog' },
  { code: 'tam', name: 'Tamil', nameKo: '타밀어', flag: '🇮🇳', label: 'தமிழ்' },
  { code: 'pan', name: 'Punjabi', nameKo: '펀자브어', flag: '🇮🇳', label: 'ਪੰਜਾਬੀ' },
  { code: 'ell', name: 'Greek', nameKo: '그리스어', flag: '🇬🇷', label: 'Ελληνικά' },
  { code: 'ces', name: 'Czech', nameKo: '체코어', flag: '🇨🇿', label: 'Čeština' },
  { code: 'slk', name: 'Slovak', nameKo: '슬로바키아어', flag: '🇸🇰', label: 'Slovenčina' },
  { code: 'hun', name: 'Hungarian', nameKo: '헝가리어', flag: '🇭🇺', label: 'Magyar' },
  { code: 'ron', name: 'Romanian', nameKo: '루마니아어', flag: '🇷🇴', label: 'Română' },
  { code: 'bul', name: 'Bulgarian', nameKo: '불가리아어', flag: '🇧🇬', label: 'Български' },
  { code: 'hrv', name: 'Croatian', nameKo: '크로아티아어', flag: '🇭🇷', label: 'Hrvatski' },
  { code: 'ukr', name: 'Ukrainian', nameKo: '우크라이나어', flag: '🇺🇦', label: 'Українська' },
  { code: 'swe', name: 'Swedish', nameKo: '스웨덴어', flag: '🇸🇪', label: 'Svenska' },
  { code: 'dan', name: 'Danish', nameKo: '덴마크어', flag: '🇩🇰', label: 'Dansk' },
  { code: 'nor', name: 'Norwegian', nameKo: '노르웨이어', flag: '🇳🇴', label: 'Norsk' },
  { code: 'fin', name: 'Finnish', nameKo: '핀란드어', flag: '🇫🇮', label: 'Suomi' },
  { code: 'nan', name: 'Hokkien', nameKo: '호키엔어', flag: '🇹🇼', label: '閩南語' },
];

/** 상위 10개 주요 언어 코드 (typecast 언어 필터 초기 표시용) */
export const TYPECAST_TOP_LANGUAGES = TYPECAST_LANGUAGES.slice(0, 10).map(l => l.code);

// === Built-in Voice Catalog (API 없이 즉시 표시) — 487 voices ===

const ALL_EMOTIONS: string[] = ['normal','happy','sad','angry','whisper','toneup','tonedown'];

/** ssfm-v30 전용 감정 프리셋 (whisper, tonedown 지원) */
export const V30_EMOTIONS: string[] = ['normal','happy','sad','angry','whisper','toneup','tonedown'];
/** ssfm-v21 전용 감정 프리셋 (tonemid 지원, whisper/tonedown 미지원) */
export const V21_EMOTIONS: string[] = ['normal','happy','sad','angry','tonemid','toneup'];

const BUILTIN_TYPECAST_VOICES: TypecastVoice[] = [
  // ─── Korean Characters (413) ───
  { voice_id: 'tc_ari', name: '아리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Ari/Ari_256.webp' },
  { voice_id: 'tc_anchorhwa', name: '앵커화', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/AnchorHwa/anchorhwa_256.webp' },
  { voice_id: 'tc_bono', name: '보노', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Bono/bono2.webp' },
  { voice_id: 'tc_bumsoo', name: '범수', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Bumsoo/beomsoo_256.webp' },
  { voice_id: 'tc_byunsa', name: '변사', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Byunsa_rev2/Byunsa_256.webp' },
  { voice_id: 'tc_chanhyuk', name: '찬혁', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Chanhyuk/chanhyuk_256.webp' },
  { voice_id: 'tc_dahee', name: '다희', gender: 'female', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Dahee/DaHee_256.webp' },
  { voice_id: 'tc_duckchun', name: '덕천', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Duckchun/DeokChun_256.webp' },
  { voice_id: 'tc_geumhee', name: '금희', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/GeumHee/GeumHee_256.webp' },
  { voice_id: 'tc_haeun', name: '하은', gender: 'female', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/HaEun/HaEun_256.webp' },
  { voice_id: 'tc_hyejung', name: '혜정', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Hyejung/HyeJung_256.webp' },
  { voice_id: 'tc_hyunjin', name: '현진', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Hyunjin/HyunJin_256.webp' },
  { voice_id: 'tc_hyunkyung', name: '현경', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Hyunkyung/HyunKyung_256.webp' },
  { voice_id: 'tc_instructorhan', name: '한교관', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/InstructorHan/InstructorHan_256.webp' },
  { voice_id: 'tc_jaehun', name: '재훈', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jaehun/JaeHoon_256.webp' },
  { voice_id: 'tc_jeongseob', name: '정섭', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jeongseob/JeongSeop_256.webp' },
  { voice_id: 'tc_jewby', name: '주비', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jewby/JewBy_256.webp' },
  { voice_id: 'tc_jicheol', name: '지철', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/jicheol/JiChul_256.webp' },
  { voice_id: 'tc_jinhyuk', name: '진혁', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jinhyuk/JinHyuk_256.webp' },
  { voice_id: 'tc_jiwoo', name: '지우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jiwoo/JiWoo_256.webp' },
  { voice_id: 'tc_jiyoung', name: '지영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jiyoung/JiYeong_256.webp' },
  { voice_id: 'tc_juha', name: '주하', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Juha/JuHa_256.webp' },
  { voice_id: 'tc_junghee', name: '정희', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Junghee/JungHee_256.webp' },
  { voice_id: 'tc_jungsoon', name: '정순', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jungsoon/JeongSoon_256.webp' },
  { voice_id: 'tc_jungwon', name: '정원', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Jungwon/JeongWon_256.webp' },
  { voice_id: 'tc_junsang', name: '준상', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Junsang/JunSang_256.webp' },
  { voice_id: 'tc_juwon', name: '주원', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Juwon/JuWon_256.webp' },
  { voice_id: 'tc_kukhee', name: '국희', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Kukhee/KookHee_256.webp' },
  { voice_id: 'tc_kyungsook', name: '경숙', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Kyungsook/KyungSook_256.webp' },
  { voice_id: 'tc_lady_cho', name: '조여사', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Lady-Cho_rev2/Lady-Cho_256.webp' },
  { voice_id: 'tc_lamie', name: '라미', gender: 'female', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Lamie_rev2/Lamie_256.webp' },
  { voice_id: 'tc_lily', name: '릴리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Lily/Lily_256.webp' },
  { voice_id: 'tc_mc_typecast', name: 'MC타캐', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/mc-typecast_rev2/mc-typecast_256.webp' },
  { voice_id: 'tc_minji', name: '민지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Minji/MinJi.webp' },
  { voice_id: 'tc_minsang', name: '민상', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Minsang/MinSang_256.webp' },
  { voice_id: 'tc_mio', name: '미오', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Mio/MiOh_256.webp' },
  { voice_id: 'tc_myeonghee', name: '명희', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Myeonghee/MyoungHee_256.webp' },
  { voice_id: 'tc_najin', name: '나진', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Najin/NaJin_256.webp' },
  { voice_id: 'tc_old_radio', name: '올드라디오', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/old-radio_rev2/old-radio_256.webp' },
  { voice_id: 'tc_reporterbona', name: '보나리포터', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/ReporterBona/ReporterBona_256.webp' },
  { voice_id: 'tc_reporterkang', name: '강수정리포터', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/ReporterKang/KangSooJung_256.webp' },
  { voice_id: 'tc_reporterlee', name: '이승주리포터', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/ReporterLee/LeeSeungJoo_256.webp' },
  { voice_id: 'tc_sangdo', name: '상도', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sangdo/SangDo_256.webp' },
  { voice_id: 'tc_santareporter', name: 'VJ산타', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/SantaReporter/VJSanta_256.webp' },
  { voice_id: 'tc_shinhe', name: '신혜', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Shinhe/ShinHe_256.webp' },
  { voice_id: 'tc_smoke', name: '스모크', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Smoke/Smoke_256.webp' },
  { voice_id: 'tc_soyoung', name: '소영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Soyoung/SoYoung_256.webp' },
  { voice_id: 'tc_sportscaster_tony', name: '스포츠캐스터토니', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sportscaster-Tony_rev2/Sportscaster-Tony_256.webp' },
  { voice_id: 'tc_sujin', name: '수진', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sujin/SooJin_256.webp' },
  { voice_id: 'tc_sungbae', name: '성배', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sungbae/SungBae_256.webp' },
  { voice_id: 'tc_sunggyu', name: '성규', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sunggyu/SungGyu_256.webp' },
  { voice_id: 'tc_sungho', name: '성호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sungho/SungHo-v2_256.webp' },
  { voice_id: 'tc_sungwook', name: '성욱', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sungwook/SungWook_256.webp' },
  { voice_id: 'tc_sunyoung', name: '선영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Sunyoung/SunYoung_256.webp' },
  { voice_id: 'tc_valkyrie', name: '발키리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Valkyrie/Valkyrie.webp' },
  { voice_id: 'tc_wooju', name: '우주', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Wooju/WooJu_256.webp' },
  { voice_id: 'tc_yeonwoo', name: '연우', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Yeonwoo/YeonWoo.webp' },
  { voice_id: 'tc_yongsik', name: '용식', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Yongsik/YongSik_256.webp' },
  { voice_id: 'tc_yoonsung', name: '윤성', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Yoonsung/YoonSung_256.webp' },
  { voice_id: 'tc_younggil', name: '영길', gender: 'male', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Younggil/YoungGil_256.webp' },
  { voice_id: 'tc_younghee', name: '영희', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/Younghee/YoungHee_256.webp' },
  { voice_id: 'tc_hayoung', name: '하영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210629_Hayoung/hayoung_main_256.webp' },
  { voice_id: 'tc_hajun', name: '하준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210629_Hajun/hajun_main_256.webp' },
  { voice_id: 'tc_uichan', name: '의찬', gender: 'male', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210713_uichan/uichan_main256.webp' },
  { voice_id: 'tc_gaul', name: '가을', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210721_gaul/gaul_main_256.webp' },
  { voice_id: 'tc_noel', name: '노을', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210721_noel/noel_main_256.webp' },
  { voice_id: 'tc_youngkyu', name: '영규', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210810_youngkyu/youngkyu_main_256.webp' },
  { voice_id: 'tc_yura', name: '유라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210810_yura/yura_main_256.webp' },
  { voice_id: 'tc_hyunwoo', name: '현우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210817_Hyunwoo/hyunwoo_main256.webp' },
  { voice_id: 'tc_sehee', name: '세희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210817_Sehee/sehee_main256.webp' },
  { voice_id: 'tc_yerin', name: '예린', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210817_Yerin/yerin_main256.webp' },
  { voice_id: 'tc_hansukpil', name: '한석필', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210824_hansukpil/hansukpil_main_256.webp' },
  { voice_id: 'tc_jungjin', name: '정진', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210824_jungjin/jungjin_main_256.webp' },
  { voice_id: 'tc_jay', name: '제이', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210831_jay/jay_ui256241216.webp' },
  { voice_id: 'tc_junki', name: '준기', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210831_junki/junki_main_256.webp' },
  { voice_id: 'tc_robo', name: '로보', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210907_robo/robo_main_256.webp' },
  { voice_id: 'tc_romi', name: '로미', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Kids'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210907_romi/romi_main_256.webp' },
  { voice_id: 'tc_avong', name: '아봉', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210928_avong/avong_main_256.webp' },
  { voice_id: 'tc_pangpang', name: '팡팡', gender: 'male', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/210928_pangpang/pangpang_main_256.webp' },
  { voice_id: 'tc_jian', name: '지안', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211005_jian/jian_main256.webp' },
  { voice_id: 'tc_hana', name: '하나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211012_hana/hana_main256.webp' },
  { voice_id: 'tc_ryueun', name: '류은', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211012_ryueun/ryueun_main256.webp' },
  { voice_id: 'tc_bora', name: '보라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Kids'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211102_bora/bora_main256.webp' },
  { voice_id: 'tc_deokgu', name: '덕구', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211102_deokgu/deokgu_main256.webp' },
  { voice_id: 'tc_hanjun', name: '한준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211109_hanjun/hanjun_main_256.webp' },
  { voice_id: 'tc_insung', name: '인성', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211109_insung/insung_main_256.webp' },
  { voice_id: 'tc_parkchan', name: '박찬', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211109_parkchan/parkchan_main_256.webp' },
  { voice_id: 'tc_ilho', name: '일호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211116_ilho/ilho_main_256.webp' },
  { voice_id: 'tc_beri', name: '베리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211123_beri/beri_main256.webp' },
  { voice_id: 'tc_moru', name: '모루', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211123_moru/moru_main256.webp' },
  { voice_id: 'tc_aeran', name: '애란', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211221_aeran/aeran_main256.webp' },
  { voice_id: 'tc_gunnkim', name: '건킴', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211221_gunnkim/kimgunn_main256.webp' },
  { voice_id: 'tc_sookhee', name: '숙희', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211221_sookhee/sookhee_main256.webp' },
  { voice_id: 'tc_joonghyun', name: '중현', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/211228_joonghyun/joonghyun_main256.webp' },
  { voice_id: 'tc_sejin', name: '세진', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220111_sejin/sejin_main_256.webp' },
  { voice_id: 'tc_seungheon', name: '승헌', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220118_seungheon/seungheon_main256.webp' },
  { voice_id: 'tc_yena', name: '예나', gender: 'female', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220118_yena/yena_main256.webp' },
  { voice_id: 'tc_jihoon', name: '지훈', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220125_jihoon/jihoon_main_256.webp' },
  { voice_id: 'tc_lala', name: '라라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Kids'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220125_lala/lala_main_256.webp' },
  { voice_id: 'tc_kimjinhang', name: '김진항', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220208_kimjinhang/kimjinhang_main256.webp' },
  { voice_id: 'tc_mrgop', name: '미스터곱', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220208_mrgop/mrgop_main256.webp' },
  { voice_id: 'tc_choyeon', name: '초연', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220215_choyeon/choyeon_main256.webp' },
  { voice_id: 'tc_spice', name: '스파이스', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220215_spice/spice_main256.webp' },
  { voice_id: 'tc_hyesu', name: '혜수', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220222_hyesu/hyesu_main256.webp' },
  { voice_id: 'tc_shorin', name: '쇼린', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220222_shorin/shorin_main256.webp' },
  { voice_id: 'tc_sungjun', name: '성준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220222_sungjun/sungjun_main256.webp' },
  { voice_id: 'tc_jiyoon', name: '지윤', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220310_jiyoon/jiyoon_ui256.webp' },
  { voice_id: 'tc_sena', name: '세나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220310_sena/sena_ui256.webp' },
  { voice_id: 'tc_hyunseung', name: '현승', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220316_hyunseung/hyunseung_ui256.webp' },
  { voice_id: 'tc_mckong', name: 'MC콩', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220316_mckong/mckong_ui256.webp' },
  { voice_id: 'tc_sammy', name: '새미', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220323_sammy/sammy_ui256.webp' },
  { voice_id: 'tc_dasom', name: '다솜', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220330_dasom/dasom_ui256.webp' },
  { voice_id: 'tc_sangwoo', name: '상우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220330_sangwoo/sangwoo_ui256.webp' },
  { voice_id: 'tc_gahee', name: '가희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220406_gahee/gahee_ui256.webp' },
  { voice_id: 'tc_gunwoo', name: '건우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220406_gunwoo/gunwoo_ui256.webp' },
  { voice_id: 'tc_morgan', name: '모건', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220413_morgan/morgan_ui256.webp' },
  { voice_id: 'tc_junhee', name: '준희', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220420_junhee/junhee_ui256.webp' },
  { voice_id: 'tc_sungtae', name: '성태', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220420_sungtae/sungtae_ui256.webp' },
  { voice_id: 'tc_ina', name: '이나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220426_ina/ina_ui256.webp' },
  { voice_id: 'tc_suji', name: '수지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220426_suji/suji_ui256.webp' },
  { voice_id: 'tc_harin', name: '하린', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220504_harin/harin_ui256.webp' },
  { voice_id: 'tc_hyunmin', name: '현민', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220511_hyunmin/hyunmin_ui256.webp' },
  { voice_id: 'tc_kyungho', name: '경호', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220511_kyungho/kyungho_ui256.webp' },
  { voice_id: 'tc_kangsports', name: '강스포츠', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220517_kangsports/kangsports_ui256.webp' },
  { voice_id: 'tc_siwon', name: '시원', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220517_siwon/siwon_ui256.webp' },
  { voice_id: 'tc_daegil', name: '대길', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220524_daegil/__abtest__b/daegil_ui256.webp' },
  { voice_id: 'tc_hanna', name: '한나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220524_hanna/__abtest__b/hanna_ui256.webp' },
  { voice_id: 'tc_inhwa', name: '인화', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220531_inhwa/inhwa_ui256.webp' },
  { voice_id: 'tc_jabbaba', name: '자바바', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Kids'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220614_jabbaba/jabbaba_ui256.webp' },
  { voice_id: 'tc_kiseob', name: '기섭', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220614_kiseob/kiseob_ui256.webp' },
  { voice_id: 'tc_soyul', name: '소율', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220628_soyul/soyul_ui256.webp' },
  { voice_id: 'tc_seungwon', name: '승원', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220705_seungwon/seungwon_ui256.webp' },
  { voice_id: 'tc_sora', name: '소라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220705_sora/sora_ui256.webp' },
  { voice_id: 'tc_seokchoi', name: '석최', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220713_seokchoi/seokchoi_ui256.webp' },
  { voice_id: 'tc_younghwan', name: '영환', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220713_younghwan/younghwan3_ui256.webp' },
  { voice_id: 'tc_ian', name: '이안', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220719_ian/ian_ui256.webp' },
  { voice_id: 'tc_myungil', name: '명일', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220719_myungil/myungil_ui256.webp' },
  { voice_id: 'tc_jungjae', name: '정재', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220727_jungjae/jungjae_ui256.webp' },
  { voice_id: 'tc_shotgun', name: '샷건', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220727_shotgun/shotgun_ui256.webp' },
  { voice_id: 'tc_hyelee', name: '혜리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220802_hyelee/hyelee_ui256.webp' },
  { voice_id: 'tc_taesub', name: '태섭', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220810_taesub/taesub_ui256.webp' },
  { voice_id: 'tc_haejun', name: '해준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220824_haejun/haejun_ui256.webp' },
  { voice_id: 'tc_jinwoo', name: '진우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220915_jinwoo/jinwoo_ui256.webp' },
  { voice_id: 'tc_hamchu', name: '햄추', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220915_hamchu/hamchu_ui256.webp' },
  { voice_id: 'tc_junho', name: '준호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220921_junho/junho_ui2562.webp' },
  { voice_id: 'tc_dana', name: '다나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220928_dana/dana_ui256.webp' },
  { voice_id: 'tc_hyunju', name: '현주', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/220928_hyunju/hyunju_ui256.webp' },
  { voice_id: 'tc_mikyung', name: '미경', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221005_mikyung/mikyung_ui256.webp' },
  { voice_id: 'tc_guri', name: '구리', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221027_guri/guri_ui256.webp' },
  { voice_id: 'tc_hoon', name: '훈', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221027_hoon/hoon_ui256.webp' },
  { voice_id: 'tc_hobin', name: '호빈', gender: 'male', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221030_recovery/hobin_ui256.webp' },
  { voice_id: 'tc_homun', name: '호문', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221102_homun/homun_ui256.webp' },
  { voice_id: 'tc_seungyeon', name: '승연', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221102_seungyeon/seungyeon_ui256.webp' },
  { voice_id: 'tc_jungbong', name: '정봉', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221109_jungbong/jungbong_ui256.webp' },
  { voice_id: 'tc_sanghoon', name: '상훈', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221109_sanghoon/sanghoon_ui256.webp' },
  { voice_id: 'tc_changmin', name: '창민', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221116_changmin/changmin_ui256.webp' },
  { voice_id: 'tc_mijin', name: '미진', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221116_mijin/mijin_ui256.webp' },
  { voice_id: 'tc_seoyeon', name: '서연', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221122_seoyeon/seoyeon_ui256.webp' },
  { voice_id: 'tc_jolly', name: '졸리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221130_jolly/jolly_ui256.webp' },
  { voice_id: 'tc_ksanta', name: '케이산타', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221130_ksanta/santah_ui256.webp' },
  { voice_id: 'tc_hakchul', name: '학철', gender: 'male', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221222_hakchul/hakchul_ui256.webp' },
  { voice_id: 'tc_minsu', name: '민수', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221222_minsu/minsu_ui256.webp' },
  { voice_id: 'tc_changu', name: '찬구', gender: 'male', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221227_changu_chaelyn/changu_ui256.webp' },
  { voice_id: 'tc_chaelyn', name: '채린', gender: 'female', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221227_changu_chaelyn/chaelyn_ui256.webp' },
  { voice_id: 'tc_kimbanjang', name: '김반장', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221227_kimbanjang/kimbanjang_ui256.webp' },
  { voice_id: 'tc_seojoon', name: '서준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221227_seojoon/seojoon_ui256.webp' },
  { voice_id: 'tc_soobin', name: '수빈', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/221227_soobin/soobin_ui256.webp' },
  { voice_id: 'tc_jooeun', name: '주은', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230105_jooeun/jooeun_ui256.webp' },
  { voice_id: 'tc_jin', name: '진', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230111_jin/newjin_ui256.webp' },
  { voice_id: 'tc_dohan', name: '도한', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230118_dohan/dohan_ui256.webp' },
  { voice_id: 'tc_hosik', name: '호식', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230118_hosik/hosik_ui256.webp' },
  { voice_id: 'tc_jechan', name: '제찬', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230127_jechan/jechan_ui256.webp' },
  { voice_id: 'tc_seungmoon', name: '승문', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230127_seungmoon/seungmoon_ui256.webp' },
  { voice_id: 'tc_kijang', name: '기장', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230201_kijang/kijang_ui256.webp' },
  { voice_id: 'tc_sullock', name: '설록', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230201_sullock/sullock_ui256.webp' },
  { voice_id: 'tc_choijung', name: '최정', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230209_choijung/choijung_ui256.webp' },
  { voice_id: 'tc_yeonah', name: '연아', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230209_imagefix/yeonah2_main256.webp' },
  { voice_id: 'tc_jaeho', name: '재호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230216_jaeho/jaeho_ui256.webp' },
  { voice_id: 'tc_yejoon', name: '예준', gender: 'male', age: 'teenager', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230216_yejoon/yejoon_ui256.webp' },
  { voice_id: 'tc_teal', name: '틸', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230223_teal/teal_ui256.webp' },
  { voice_id: 'tc_arang', name: '아랑', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230302_arang/arang_ui256.webp' },
  { voice_id: 'tc_hyewon', name: '혜원', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230309_hyewon/hyewon_ui256.webp' },
  { voice_id: 'tc_sungkwon', name: '성권', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230316_sungkwon/sungkwon_ui256.webp' },
  { voice_id: 'tc_jeongah', name: '정아', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230323_jeongah/jeongah_ui256.webp' },
  { voice_id: 'tc_heejun', name: '희준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230331_heejun/heejun_ui256.webp' },
  { voice_id: 'tc_sohye', name: '소혜', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230407_sohye/sohye_ui256.webp' },
  { voice_id: 'tc_joonkyu', name: '준규', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230413_joonkyu/joonkyu_ui256.webp' },
  { voice_id: 'tc_minjoon', name: '민준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230419_minjoon/minjun_ui256.webp' },
  { voice_id: 'tc_dohee', name: '도희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230427_dohee/dohee_ui256.webp' },
  { voice_id: 'tc_seungah', name: '승아', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230504_seungah/seungah_ui256.webp' },
  { voice_id: 'tc_seunghwa', name: '승화', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230510_seunghwa/seunghwa_ui256.webp' },
  { voice_id: 'tc_shinwook', name: '신욱', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230518_shinwook/shinwook_ui256.webp' },
  { voice_id: 'tc_taejoong', name: '태중', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230518_taejoong/taejoong_ui256.webp' },
  { voice_id: 'tc_dahyeon', name: '다현', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230525_dahyeon/dahyeon_ui256.webp' },
  { voice_id: 'tc_yubin', name: '유빈', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230608_yubin/yubin_ui256.webp' },
  { voice_id: 'tc_yujin', name: '유진', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230608_yujin/yujin_ui256.webp' },
  { voice_id: 'tc_yumin', name: '유민', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230608_yumin/yumin_ui256.webp' },
  { voice_id: 'tc_mooyeol', name: '무열', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230615_mooyeol/mooyeol_ui256.webp' },
  { voice_id: 'tc_seonha', name: '선하', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230622_seonha/seonha_ui256.webp' },
  { voice_id: 'tc_yeonsuh', name: '연서', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230714_yeonsuh/yeonsuh_ui256.webp' },
  { voice_id: 'tc_geunhyeok', name: '근혁', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230720_geunhyeok/geunhyeok_ui256.webp' },
  { voice_id: 'tc_geunwoo', name: '근우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230720_geunwoo/geunwoo_ui256.webp' },
  { voice_id: 'tc_geunyeong', name: '근영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230720_geunyeong/geunyeong_ui256.webp' },
  { voice_id: 'tc_pyeonghwa', name: '평화', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230811_pyeonghwa/pyeonghwa_ui256.webp' },
  { voice_id: 'tc_kyungsoo', name: '경수', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230824_kyungsoo/kyungsoo_ui256.webp' },
  { voice_id: 'tc_namjoon', name: '남준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230831_namjoon/namjoon_ui256.webp' },
  { voice_id: 'tc_sunghyun', name: '성현', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/230914_sunghyun/sunghyun_ui256.webp' },
  { voice_id: 'tc_jaejun', name: '재준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231020_jaejun/jaejun_ui256.webp' },
  { voice_id: 'tc_jinsub', name: '진섭', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231026_jinsub/jinsub_ui256.webp' },
  { voice_id: 'tc_hyeji', name: '혜지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231102_hyeji/hyeji_ui256.webp' },
  { voice_id: 'tc_seokpyo', name: '석표', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231109_seokpyo/seokpyo_ui256.webp' },
  { voice_id: 'tc_yuseong', name: '유성', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231109_yuseong/yuseong_ui256.webp' },
  { voice_id: 'tc_jaeyoung', name: '재영', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231116_jaeyoung/jaeyoung_ui256.webp' },
  { voice_id: 'tc_jinsubteller', name: '진섭텔러', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231116_jinsubteller/jinsubteller_ui256.webp' },
  { voice_id: 'tc_jangho', name: '장호', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231124_jangho/jangho_ui256.webp' },
  { voice_id: 'tc_myungjoo', name: '명주', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231124_myungjoo/myungjoo_ui256.webp' },
  { voice_id: 'tc_siyeon', name: '시연', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231130_siyeon/siyeon_ui256.webp' },
  { voice_id: 'tc_suho', name: '수호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231130_suho/suho_ui256.webp' },
  { voice_id: 'tc_yeonggeol', name: '영걸', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231207_yeonggeol/Yeonggeol_ui256.webp' },
  { voice_id: 'tc_hoyoung', name: '호영', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231221_hoyoung/hoyoung_ui256.webp' },
  { voice_id: 'tc_joongsik', name: '중식', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231221_joongsik/joongsik_ui256.webp' },
  { voice_id: 'tc_juho', name: '주호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231228_juho/juho_ui256.webp' },
  { voice_id: 'tc_jungmin', name: '정민', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/231228_jungmin/jungmin_ui256.webp' },
  { voice_id: 'tc_bonggyu', name: '봉규', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240104_bonggyu/bonggyu_ui256.webp' },
  { voice_id: 'tc_ggomi', name: '꼬미', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240104_ggomi/ggomi_ui256.webp' },
  { voice_id: 'tc_hosun', name: '호순', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240112_hosun/hosun_ui256.webp' },
  { voice_id: 'tc_jerome', name: '제롬', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240112_jerome/jerome_ui256.webp' },
  { voice_id: 'tc_miseon', name: '미선', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240118_miseon/miseon_ui256.webp' },
  { voice_id: 'tc_ruri', name: '루리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240118_ruri/ruri_ui256.webp' },
  { voice_id: 'tc_yeonja', name: '연자', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240125_yeonja/yeonja_ui256.webp' },
  { voice_id: 'tc_jinseo', name: '진서', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240201_jinseo/jinseo_ui256.webp' },
  { voice_id: 'tc_yunjeong', name: '윤정', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240201_yunjeong/yunjeong_ui256.webp' },
  { voice_id: 'tc_saeron', name: '새론', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240208_saeron/saeron_ui256.webp' },
  { voice_id: 'tc_eunha', name: '은하', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240215_eunha/eunha_ui256.webp' },
  { voice_id: 'tc_cox', name: '콕스', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240222_cox/cox_ui256.webp' },
  { voice_id: 'tc_hyena', name: '혜나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240222_hyena/hyena_ui256.webp' },
  { voice_id: 'tc_choimiran', name: '최미란', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240229_choimiran/choimiran_ui256.webp' },
  { voice_id: 'tc_jirisan', name: '지리산', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240229_jirisan/jirisan_ui256.webp' },
  { voice_id: 'tc_munseok', name: '문석', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240307_munseok/munseok_ui256.webp' },
  { voice_id: 'tc_yumi', name: '유미', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240307_yumi/yumi_ui256.webp' },
  { voice_id: 'tc_jihyun', name: '지현', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240314_jihyun/jihyun_ui256.webp' },
  { voice_id: 'tc_yeeun', name: '예은', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240314_yeeun/yeeun_ui256.webp' },
  { voice_id: 'tc_hayul', name: '하율', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240321_hayul/hayul_ui256.webp' },
  { voice_id: 'tc_jinung', name: '진웅', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240321_jinung/jinung_ui256.webp' },
  { voice_id: 'tc_cherry', name: '체리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240329_cherry/cherry_ui256.webp' },
  { voice_id: 'tc_taeji', name: '태지', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240329_taeji/taeji_ui256.webp' },
  { voice_id: 'tc_eunbin', name: '은빈', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240403_eunbin/eunbin_ui256.webp' },
  { voice_id: 'tc_gongchul', name: '공철', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240403_gongchul/gongchul_ui256.webp' },
  { voice_id: 'tc_hansol', name: '한솔', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240411_hansol/hansol_ui256.webp' },
  { voice_id: 'tc_kimbongman', name: '김봉만', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240411_kimbongman/kimbongman_ui256.webp' },
  { voice_id: 'tc_kangchunsik', name: '강춘식', gender: 'male', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240418_kangchunsik/kangchunsik_ui256.webp' },
  { voice_id: 'tc_mirine', name: '미리내', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240418_mirine/mirine_ui256.webp' },
  { voice_id: 'tc_Ijun', name: '이준', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240425_Ijun/Ijun_ui256.webp' },
  { voice_id: 'tc_naeun', name: '나은', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240425_naeun/naeun_ui256.webp' },
  { voice_id: 'tc_duman', name: '두만', gender: 'male', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240502_duman/duman_ui256.webp' },
  { voice_id: 'tc_eunchae', name: '은채', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240502_eunchae/eunchae_ui256.webp' },
  { voice_id: 'tc_geunseok', name: '근석', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240509_geunseok/geunseok_ui256.webp' },
  { voice_id: 'tc_roro', name: '로로', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240509_roro/roro_ui256.webp' },
  { voice_id: 'tc_insun', name: '인순', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240516_insun/insun_ui256.webp' },
  { voice_id: 'tc_munsu', name: '문수', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240516_munsu/munsu_ui256.webp' },
  { voice_id: 'tc_hyera', name: '혜라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240524_hyera/hyera_ui256.webp' },
  { voice_id: 'tc_yunbin', name: '윤빈', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240524_yunbin/yunbin_ui256.webp' },
  { voice_id: 'tc_azzi', name: '아찌', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240530_azzi/azzi_ui256.webp' },
  { voice_id: 'tc_ggami', name: '까미', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240530_ggami/ggami_ui256.webp' },
  { voice_id: 'tc_sunghoon', name: '성훈', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240607_sunghoon/sunghoon_ui256.webp' },
  { voice_id: 'tc_sojin', name: '소진', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240613_sojin/sojin_ui256.webp' },
  { voice_id: 'tc_sio', name: '시오', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240620_sio/sio_ui256.webp' },
  { voice_id: 'tc_hyemin', name: '혜민', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240627_hyemin/hyemin_ui256.webp' },
  { voice_id: 'tc_deokhwan', name: '덕환', gender: 'male', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240704_deokhwan/deokhwan_ui256.webp' },
  { voice_id: 'tc_jungseok', name: '정석', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240704_jungseok/jungseok_ui256.webp' },
  { voice_id: 'tc_woosung', name: '우성', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240711_woosung/woosung_ui256.webp' },
  { voice_id: 'tc_minjung', name: '민정', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240719_minjung/minjung_ui256.webp' },
  { voice_id: 'tc_siwoo', name: '시우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240719_siwoo/siwoo_ui256.webp' },
  { voice_id: 'tc_sua', name: '수아', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240719_sua/sua_ui256.webp' },
  { voice_id: 'tc_wangkwon', name: '왕권', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240725_wangkwon/wangkwon_ui256.webp' },
  { voice_id: 'tc_seungho', name: '승호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240801_seungho/seungho_ui256.webp' },
  { voice_id: 'tc_yeseul', name: '예슬', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240801_yeseul/yeseul_ui256.webp' },
  { voice_id: 'tc_chiho', name: '치호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240808_chiho/chiho_ui256.webp' },
  { voice_id: 'tc_minchae', name: '민채', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240808_minchae/minchae_ui256.webp' },
  { voice_id: 'tc_seoyoon', name: '서윤', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240816_seoyoon/seoyoon_ui256.webp' },
  { voice_id: 'tc_wonho', name: '원호', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240816_wonho/wonho_ui256.webp' },
  { voice_id: 'tc_inhye', name: '인혜', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240822_inhye/inhye_ui256.webp' },
  { voice_id: 'tc_taemin', name: '태민', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240822_taemin/taemin_ui256.webp' },
  { voice_id: 'tc_dohyun', name: '도현', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240829_dohyun/dohyun_ui256.webp' },
  { voice_id: 'tc_hyunji', name: '현지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240829_hyunji/hyunji_ui256.webp' },
  { voice_id: 'tc_seohee', name: '서희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240905_seohee/seohee_ui256.webp' },
  { voice_id: 'tc_yoonseo', name: '윤서', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240905_yoonseo/yoonseo_ui256.webp' },
  { voice_id: 'tc_junseong', name: '준성', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240912_junseong/junseong_ui256.webp' },
  { voice_id: 'tc_sumin', name: '수민', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240912_sumin/sumin_main.webp' },
  { voice_id: 'tc_juyoung', name: '주영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/240926_juyoung/juyoung_ui256.webp' },
  { voice_id: 'tc_biteman', name: '바이트맨', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_biteman/biteman_ui256.webp' },
  { voice_id: 'tc_down', name: '다운', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_down/down_ui256.webp' },
  { voice_id: 'tc_edo', name: '에도', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_edo/edo_ui256.webp' },
  { voice_id: 'tc_ggoolsister', name: '꿀시스터', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_ggoolsister/ggoolsister_ui256.webp' },
  { voice_id: 'tc_hangeri', name: '한거리', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_hangeri/hangeri_ui256.webp' },
  { voice_id: 'tc_hayoon', name: '하윤', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_hayoon/hayoon_ui256.webp' },
  { voice_id: 'tc_joonchic', name: '준시크', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_joonchic/joonchic_ui256.webp' },
  { voice_id: 'tc_junney', name: '저니', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_junney/junney_ui256.webp' },
  { voice_id: 'tc_layla', name: '레일라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_layla/layla_ui256.webp' },
  { voice_id: 'tc_lumina', name: '루미나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_lumina/lumina_ui256.webp' },
  { voice_id: 'tc_masterboo', name: '마스터부', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_masterboo/masterboo_ui256.webp' },
  { voice_id: 'tc_nagyoyuk', name: '나교육', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_nagyoyuk/nagyoyuk_ui256.webp' },
  { voice_id: 'tc_rapid', name: '래피드', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_rapid/rapid_ui256.webp' },
  { voice_id: 'tc_tiger', name: '타이거', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_tiger/tiger_ui256.webp' },
  { voice_id: 'tc_twistman', name: '트위스트맨', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241021_twistman/twistman_ui256.webp' },
  { voice_id: 'tc_gunseok', name: '건석', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_gunseok/gunseok_ui256.webp' },
  { voice_id: 'tc_hanyoung', name: '한영', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_hanyoung/hanyoung_ui256.webp' },
  { voice_id: 'tc_hyun', name: '현', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_hyun/hyun_ui256.webp' },
  { voice_id: 'tc_jaekyung', name: '재경', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_jaekyung/jaekyung_ui256.webp' },
  { voice_id: 'tc_jinhee', name: '진희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_jinhee/jinhee_ui256.webp' },
  { voice_id: 'tc_minju', name: '민주', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_minju/minju_ui256.webp' },
  { voice_id: 'tc_monggun', name: '몽건', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_monggun/monggun_ui256.webp' },
  { voice_id: 'tc_seolhwa', name: '설화', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_seolhwa/seolhwa_ui256.webp' },
  { voice_id: 'tc_youngji', name: '영지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241111_youngji/youngji_ui256.webp' },
  { voice_id: 'tc_jinhan', name: '진한', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241121_jinhan/jinhan_ui256.webp' },
  { voice_id: 'tc_yuri', name: '유리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241121_yuri/yuri_ui256.webp' },
  { voice_id: 'tc_goatkim', name: '갓킴', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241128_goatkim/goatkim_ui256.webp' },
  { voice_id: 'tc_hwimin', name: '희민', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241128_hwimin/hwimin_ui256.webp' },
  { voice_id: 'tc_arin', name: '아린', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241205_arin/arin_ui256.webp' },
  { voice_id: 'tc_chungah', name: '정아', gender: 'female', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241205_chungah/chungah_ui256.webp' },
  { voice_id: 'tc_kwonil', name: '권일', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241212_kwonil/kwonil_ui256.webp' },
  { voice_id: 'tc_wonkyung', name: '원경', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241212_wonkyung/wonkyung_ui256.webp' },
  { voice_id: 'tc_kyumin', name: '규민', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241219_kyumin/kyumin_ui256.webp' },
  { voice_id: 'tc_suyoon', name: '수윤', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241219_suyoon/suyoon_ui256.webp' },
  { voice_id: 'tc_ael', name: '에일', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241226_ael/ael_ui256.webp' },
  { voice_id: 'tc_tian', name: '티안', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/241226_tian/tian_ui256.webp' },
  { voice_id: 'tc_babilon', name: '바빌론', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250102_babilon/babilon_ui256.webp' },
  { voice_id: 'tc_changhee', name: '창희', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250102_changhee/changhee_ui256.webp' },
  { voice_id: 'tc_hangyeol', name: '한결', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250109_hangyeol/hangyeol_ui256.webp' },
  { voice_id: 'tc_miso', name: '미소', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250109_miso/miso_ui256.webp' },
  { voice_id: 'tc_haerang', name: '해랑', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250116_haerang/haerang_ui256.webp' },
  { voice_id: 'tc_jangwoon', name: '장운', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250116_jangwoon/jangwoon_ui256.webp' },
  { voice_id: 'tc_seungjae', name: '승재', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250123_seungjae/seungjae_ui256.webp' },
  { voice_id: 'tc_rowoon', name: '로운', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250206_rowoon/rowoon_ui256.webp' },
  { voice_id: 'tc_dabin', name: '다빈', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250213_dabin/dabin_ui256.webp' },
  { voice_id: 'tc_soyi', name: '소이', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250220_soyi/soyi_ui256.webp' },
  { voice_id: 'tc_igyeom', name: '이겸', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250227_igyeom/igyeom_ui256.webp' },
  { voice_id: 'tc_sewoo', name: '세우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250313_sewoo/sewoo_ui256.webp' },
  { voice_id: 'tc_eunsol', name: '은솔', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250320_eunsol/eunsol_ui256.webp' },
  { voice_id: 'tc_jongdae', name: '종대', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250326_jongdae/jongdae_ui256.webp' },
  { voice_id: 'tc_sandra', name: '산드라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250409_sandra/sandra_ui256.webp' },
  { voice_id: 'tc_crankyman', name: '크랭키맨', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250410_crankyman/crankyman_ui256.webp' },
  { voice_id: 'tc_taeyui', name: '태유이', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250410_taeyui/taeyui_ui256.webp' },
  { voice_id: 'tc_fussyyouth', name: '까칠청년', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250417_fussyyouth/fussyyouth_ui256.webp' },
  { voice_id: 'tc_geonhee', name: '건희', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250417_geonhee/geonhee_ui256.webp' },
  { voice_id: 'tc_hwiso', name: '휘소', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250417_hwiso/hwiso_ui256.webp' },
  { voice_id: 'tc_taewoo', name: '태우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250417_taewoo/taewoo_ui256.webp' },
  { voice_id: 'tc_cheap_noble', name: '싸구려귀족', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250424_cheap_noble/cheap_noble_ui256.webp' },
  { voice_id: 'tc_hyeonseok', name: '현석', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250424_hyeonseok/hyeonseok_ui256.webp' },
  { voice_id: 'tc_jain', name: '자인', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250424_jain/jain_ui256.webp' },
  { voice_id: 'tc_seoblin', name: '서블린', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250424_seoblin/seoblin_ui256.webp' },
  { voice_id: 'tc_ggolddak', name: '꼴딱', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250429_ggolddak/ggolddak_ui256.webp' },
  { voice_id: 'tc_turultultul', name: '투룰투루', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250429_turultultul/turultultul_main256.webp' },
  { voice_id: 'tc_yuha', name: '유하', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250429_yuha/yuha_ui256.webp' },
  { voice_id: 'tc_babyhippo', name: '아기하마', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250508_babyhippo/babyhippo_ui256.webp' },
  { voice_id: 'tc_donggul', name: '동굴', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250508_donggul/donggul_ui256.webp' },
  { voice_id: 'tc_ttaenggu', name: '땡구', gender: 'male', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250508_ttaenggu/ttaenggu_ui256.webp' },
  { voice_id: 'tc_youngmok', name: '영목', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250508_youngmok/youngmok_ui256.webp' },
  { voice_id: 'tc_beomtting', name: '범띵', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250515_beomtting/beomtting_ui256.webp' },
  { voice_id: 'tc_filmteller', name: '필름텔러', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250515_filmteller/filmteller_ui256.webp' },
  { voice_id: 'tc_muyoung', name: '무영', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250515_muyoung/muyoung_ui256.webp' },
  { voice_id: 'tc_piljae', name: '필재', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250515_piljae/piljae_ui256.webp' },
  { voice_id: 'tc_hyeongjin', name: '형진', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250522_hyeongjin/hyeongjin_ui256.webp' },
  { voice_id: 'tc_minhee', name: '민희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250522_minhee/minhee_ui256.webp' },
  { voice_id: 'tc_sleep', name: '슬립', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250522_sleep/sleep_ui256.png' },
  { voice_id: 'tc_sunmin', name: '선민', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250522_sunmin/sunmin_ui256.png' },
  { voice_id: 'tc_hoin', name: '호인', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250528_hoin/hoin_ui256.webp' },
  { voice_id: 'tc_knowell', name: '노웰', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250528_knowell/knowell_ui256.webp' },
  { voice_id: 'tc_soonnam', name: '순남', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250528_soonnam/soonnam_ui256.webp' },
  { voice_id: 'tc_soye', name: '소예', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250528_soye/soye_ui256.webp' },
  { voice_id: 'tc_biriri', name: '비리리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250605_biriri/biriri_ui256.webp' },
  { voice_id: 'tc_joojin', name: '주진', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250605_joojin/joojin_ui256.webp' },
  { voice_id: 'tc_rayeon', name: '라연', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250605_rayeon/rayeon_ui256.webp' },
  { voice_id: 'tc_shoe', name: '슈', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250605_shoe/shoe_ui256.webp' },
  { voice_id: 'tc_jackie', name: '재키', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250612_jackie/jackie_ui256.webp' },
  { voice_id: 'tc_jaesun', name: '재선', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250612_jaesun/jaesun_ui256.webp' },
  { voice_id: 'tc_peach', name: '피치', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250612_peach/peach_ui256.webp' },
  { voice_id: 'tc_tara', name: '타라', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250612_tara/tara_ui256.webp' },
  { voice_id: 'tc_seojin', name: '서진', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250619_seojin/seojin_ui256.webp' },
  { voice_id: 'tc_cheolhoon', name: '철훈', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250626_cheolhoon/cheolhoon_ui256.webp' },
  { voice_id: 'tc_seheon', name: '세헌', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250703_seheon/seheon_ui256.webp' },
  { voice_id: 'tc_wonwoo', name: '원우', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250709_wonwoo/wonwoo_ui256.webp' },
  { voice_id: 'tc_gowoon', name: '고운', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250717_gowoon/gowoon_ui256.webp' },
  { voice_id: 'tc_kangil', name: '강일', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/250925_kangil/kangil_ui256.webp' },
  { voice_id: 'tc_leehyun', name: '이현', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251002_leehyun/leehyun_ui256.webp' },
  { voice_id: 'tc_minuk', name: '민욱', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251016_minuk/minuk_ui256.webp' },
  { voice_id: 'tc_moonjung', name: '문정', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251023_moonjung/moonjung_ui256.webp' },
  { voice_id: 'tc_hyoeun', name: '효은', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251119_hyoeun/hyoeun_ui256.webp' },
  { voice_id: 'tc_daeun', name: '다은', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251127_daeun/daeun_ui256.webp' },
  { voice_id: 'tc_byunghun', name: '병훈', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251217_byunghun/byunghun_ui256.webp' },
  { voice_id: 'tc_jungsook', name: '정숙', gender: 'female', age: 'senior', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/251224_jungsook/jungsook_main256.webp' },
  { voice_id: 'tc_bboddo', name: '뽀또', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/260225_bboddo/bboddo_ui256.webp' },
  { voice_id: 'tc_booqoo', name: '부꾸', gender: 'male', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/260225_booqoo/booqoo_ui256.webp' },
  { voice_id: 'tc_eogwool', name: '어꿀', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/260225_eogwool/eogwool_ui256.webp' },
  { voice_id: 'tc_mongsil', name: '몽실', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/260225_mongsil/mongsil_ui256.webp' },
  { voice_id: 'tc_okji', name: '옥지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/260225_okji/okji_ui256.webp' },
  { voice_id: 'tc_bibim', name: '비빔', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Conversational'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/bibim_main256.webp' },
  { voice_id: 'tc_bomi', name: '보미', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Kids'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/bomi_main_256.webp' },
  { voice_id: 'tc_butta', name: '버타', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/buttamain256.webp' },
  { voice_id: 'tc_changbae', name: '창배', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/changbae_main256.webp' },
  { voice_id: 'tc_chulyong', name: '철용', gender: 'male', age: 'middle_age', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/chulyong_main256.webp' },
  { voice_id: 'tc_du5t', name: '더스트', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/du5t_main256.webp' },
  { voice_id: 'tc_dvzy', name: '디브지', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/dvzy_main256.webp' },
  { voice_id: 'tc_jihee', name: '지희', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/jihee_main256.webp' },
  { voice_id: 'tc_justice', name: '저스티스', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/justice_main256.webp' },
  { voice_id: 'tc_luna', name: '루나', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/luna_main256.webp' },
  { voice_id: 'tc_nari', name: '나리', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/nari_main256.webp' },
  { voice_id: 'tc_omija', name: '오미자', gender: 'female', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/omija_main256.webp' },
  { voice_id: 'tc_pacang', name: '파창', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/pacangmain256.webp' },
  { voice_id: 'tc_sooni', name: '순이', gender: 'female', age: 'child', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','E-learning'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/sooni_main256.webp' },
  { voice_id: 'tc_sky', name: '스카이', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Narration'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/skymain256.webp' },
  { voice_id: 'tc_taebaek', name: '태백', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/taebaek_main256.webp' },
  { voice_id: 'tc_toby', name: '토비', gender: 'male', age: 'young_adult', language: ['kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Short-form'], preview_url: undefined, image_url: 'https://static2.typecast.ai/c/tobymain256.webp' },

  // ─── English Characters (17) ───
  { voice_id: 'tc_athena', name: 'Athena', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_natalie', name: 'Natalie', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_uncle_hank', name: 'Uncle Hank', gender: 'male', age: 'middle_age', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_slushy', name: 'Slushy', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Kids'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_vanessa', name: 'Vanessa', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Short-form'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_julia', name: 'Julia', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Narration'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_peter', name: 'Peter', gender: 'male', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_phillip', name: 'Phillip', gender: 'male', age: 'middle_age', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_jack', name: 'Jack', gender: 'male', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Game'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_glenda', name: 'Glenda', gender: 'female', age: 'middle_age', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_dollar_jr', name: 'Dollar Jr.', gender: 'male', age: 'teenager', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_olivia', name: 'Olivia', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_jennifer', name: 'Jennifer', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_tommy', name: 'Tommy', gender: 'male', age: 'teenager', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Kids','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_camila', name: 'Camila', gender: 'female', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_jimmy', name: 'Jimmy', gender: 'male', age: 'young_adult', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_hanker', name: 'Hanker', gender: 'male', age: 'middle_age', language: ['eng','kor'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },

  // ─── Japanese (8) ───
  { voice_id: 'tc_mio_jp', name: 'Mio', gender: 'female', age: 'young_adult', language: ['jpn','kor','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_yuki', name: 'Yuki', gender: 'female', age: 'young_adult', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_sakura', name: 'Sakura', gender: 'female', age: 'teenager', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_haruto', name: 'Haruto', gender: 'male', age: 'young_adult', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','News'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_ren', name: 'Ren', gender: 'male', age: 'young_adult', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Game'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_hana_jp', name: 'Hana', gender: 'female', age: 'young_adult', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_kenji', name: 'Kenji', gender: 'male', age: 'middle_age', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_aoi', name: 'Aoi', gender: 'female', age: 'teenager', language: ['jpn','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Kids'], preview_url: undefined, image_url: undefined },

  // ─── Chinese Mandarin (8) ───
  { voice_id: 'tc_xiaomei', name: '小美 Xiaomei', gender: 'female', age: 'young_adult', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_zhiwei', name: '志伟 Zhiwei', gender: 'male', age: 'young_adult', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_liling', name: '丽玲 Liling', gender: 'female', age: 'young_adult', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Short-form'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_haoran', name: '浩然 Haoran', gender: 'male', age: 'middle_age', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_yutong', name: '雨桐 Yutong', gender: 'female', age: 'teenager', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Anime','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_jianming', name: '建明 Jianming', gender: 'male', age: 'young_adult', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','News'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_wanxin', name: '婉欣 Wanxin', gender: 'female', age: 'young_adult', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_mingyu', name: '明宇 Mingyu', gender: 'male', age: 'teenager', language: ['zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Game','Anime'], preview_url: undefined, image_url: undefined },

  // ─── Chinese Cantonese (4) ───
  { voice_id: 'tc_wingyan', name: '穎欣 Wing Yan', gender: 'female', age: 'young_adult', language: ['yue','zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_kaiming', name: '啟明 Kai Ming', gender: 'male', age: 'young_adult', language: ['yue','zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_siufung', name: '小鳳 Siu Fung', gender: 'female', age: 'young_adult', language: ['yue','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Short-form','Ads'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_wahkeung', name: '華強 Wah Keung', gender: 'male', age: 'middle_age', language: ['yue','zho','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },

  // ─── Spanish (4) ───
  { voice_id: 'tc_sofia_es', name: 'Sofia', gender: 'female', age: 'young_adult', language: ['spa','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_carlos', name: 'Carlos', gender: 'male', age: 'young_adult', language: ['spa','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_valentina', name: 'Valentina', gender: 'female', age: 'young_adult', language: ['spa','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','Short-form'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_diego', name: 'Diego', gender: 'male', age: 'middle_age', language: ['spa','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },

  // ─── French (4) ───
  { voice_id: 'tc_amelie', name: 'Amélie', gender: 'female', age: 'young_adult', language: ['fra','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_lucas_fr', name: 'Lucas', gender: 'male', age: 'young_adult', language: ['fra','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','News'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_chloe_fr', name: 'Chloé', gender: 'female', age: 'young_adult', language: ['fra','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['E-learning','Ads'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_antoine', name: 'Antoine', gender: 'male', age: 'middle_age', language: ['fra','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },

  // ─── German (4) ───
  { voice_id: 'tc_lena_de', name: 'Lena', gender: 'female', age: 'young_adult', language: ['deu','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_maximilian', name: 'Maximilian', gender: 'male', age: 'young_adult', language: ['deu','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','News'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_emma_de', name: 'Emma', gender: 'female', age: 'young_adult', language: ['deu','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_felix_de', name: 'Felix', gender: 'male', age: 'middle_age', language: ['deu','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Audiobook','Narration'], preview_url: undefined, image_url: undefined },

  // ─── Italian (3) ───
  { voice_id: 'tc_giulia', name: 'Giulia', gender: 'female', age: 'young_adult', language: ['ita','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_marco_it', name: 'Marco', gender: 'male', age: 'young_adult', language: ['ita','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','News'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_alessia', name: 'Alessia', gender: 'female', age: 'young_adult', language: ['ita','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Ads','E-learning'], preview_url: undefined, image_url: undefined },

  // ─── Portuguese (3) ───
  { voice_id: 'tc_ana_pt', name: 'Ana', gender: 'female', age: 'young_adult', language: ['por','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_pedro_pt', name: 'Pedro', gender: 'male', age: 'young_adult', language: ['por','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_beatriz', name: 'Beatriz', gender: 'female', age: 'young_adult', language: ['por','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Ads'], preview_url: undefined, image_url: undefined },

  // ─── Vietnamese (3) ───
  { voice_id: 'tc_linh', name: 'Linh', gender: 'female', age: 'young_adult', language: ['vie','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_minh', name: 'Minh', gender: 'male', age: 'young_adult', language: ['vie','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_thao', name: 'Thao', gender: 'female', age: 'young_adult', language: ['vie','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Conversational','Short-form'], preview_url: undefined, image_url: undefined },

  // ─── Thai (2) ───
  { voice_id: 'tc_ploy', name: 'Ploy', gender: 'female', age: 'young_adult', language: ['tha','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_somchai', name: 'Somchai', gender: 'male', age: 'young_adult', language: ['tha','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },

  // ─── Indonesian (2) ───
  { voice_id: 'tc_putri', name: 'Putri', gender: 'female', age: 'young_adult', language: ['ind','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_budi', name: 'Budi', gender: 'male', age: 'young_adult', language: ['ind','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','News'], preview_url: undefined, image_url: undefined },

  // ─── Hindi (2) ───
  { voice_id: 'tc_priya', name: 'Priya', gender: 'female', age: 'young_adult', language: ['hin','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_arjun', name: 'Arjun', gender: 'male', age: 'young_adult', language: ['hin','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },

  // ─── Arabic (2) ───
  { voice_id: 'tc_fatima', name: 'Fatima', gender: 'female', age: 'young_adult', language: ['ara','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_omar', name: 'Omar', gender: 'male', age: 'young_adult', language: ['ara','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },

  // ─── Russian (2) ───
  { voice_id: 'tc_anna_ru', name: 'Anna', gender: 'female', age: 'young_adult', language: ['rus','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Audiobook'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_dmitri', name: 'Dmitri', gender: 'male', age: 'young_adult', language: ['rus','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },

  // ─── Turkish (2) ───
  { voice_id: 'tc_elif', name: 'Elif', gender: 'female', age: 'young_adult', language: ['tur','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_emre', name: 'Emre', gender: 'male', age: 'young_adult', language: ['tur','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },

  // ─── Polish (2) ───
  { voice_id: 'tc_zofia', name: 'Zofia', gender: 'female', age: 'young_adult', language: ['pol','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','E-learning'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_jakub', name: 'Jakub', gender: 'male', age: 'young_adult', language: ['pol','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['News','Podcast'], preview_url: undefined, image_url: undefined },

  // ─── Dutch (2) ───
  { voice_id: 'tc_sophie_nl', name: 'Sophie', gender: 'female', age: 'young_adult', language: ['nld','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Narration','Conversational'], preview_url: undefined, image_url: undefined },
  { voice_id: 'tc_daan', name: 'Daan', gender: 'male', age: 'young_adult', language: ['nld','eng'], models: ['ssfm-v30','ssfm-v21'], emotions: ALL_EMOTIONS, use_cases: ['Podcast','News'], preview_url: undefined, image_url: undefined },
];

export { BUILTIN_TYPECAST_VOICES };

// === Voice List Cache ===

let cachedVoices: TypecastVoice[] | null = null;
let fetchPromise: Promise<TypecastVoice[]> | null = null;

export const fetchTypecastVoices = async (forceRefresh = false): Promise<TypecastVoice[]> => {
  if (cachedVoices && !forceRefresh) return cachedVoices;
  if (fetchPromise && !forceRefresh) return fetchPromise;

  const apiKey = getTypecastKey();

  // API 키 없으면 내장 카탈로그 반환
  if (!apiKey) {
    cachedVoices = BUILTIN_TYPECAST_VOICES;
    return cachedVoices;
  }

  fetchPromise = (async () => {
    try {
      // dashboard/v1/voices: 한글명, 이미지, 미리듣기, 언어 전부 포함
      const response = await monitoredFetch(`${TYPECAST_BASE_URL}/dashboard/v1/voices`, {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Typecast 음성 목록 오류 (${response.status}): ${text}`);
      }

      const data = await response.json();
      const raw = data.voices || data.result || data.data || data || [];
      const voices: TypecastVoice[] = (Array.isArray(raw) ? raw : []).map((v: Record<string, unknown>) => {
        // models 파싱: API는 [{version: "ssfm-v30", emotions: [...]}] 형태
        let modelIds: string[] = [];
        let emotionList: string[] = [];
        const modelsRaw = v.models;
        if (Array.isArray(modelsRaw)) {
          if (typeof modelsRaw[0] === 'string') {
            modelIds = modelsRaw as string[];
          } else {
            modelIds = (modelsRaw as Array<Record<string, unknown>>).map(m => (m.version || m.model_id || m.id || '') as string).filter(Boolean);
            for (const m of modelsRaw as Array<Record<string, unknown>>) {
              if (Array.isArray(m.emotions)) emotionList.push(...(m.emotions as string[]));
            }
          }
        }
        if (modelIds.length === 0) modelIds = ['ssfm-v21'];
        if (emotionList.length === 0) emotionList = ['normal'];

        // native_language → language 배열 변환
        const nativeLang = (v.native_language || '') as string;
        const langArr = nativeLang ? [nativeLang.startsWith('ko') ? 'kor' : nativeLang.startsWith('ja') ? 'jpn' : nativeLang.startsWith('en') ? 'eng' : nativeLang.split('-')[0]] : ['kor'];

        return {
          voice_id: (v.voice_id || v.id || '') as string,
          name: ((v.voice_name_ko || v.voice_name || v.name || '') as string), // 한글명 우선
          gender: ((v.gender || 'female') as string) === 'male' ? 'male' as const : 'female' as const,
          age: (v.age || '') as string,
          language: langArr,
          models: modelIds,
          emotions: [...new Set(emotionList)],
          use_cases: (Array.isArray(v.use_cases) ? v.use_cases : []) as string[],
          preview_url: ((v.audio_url || v.preview_url || undefined) as string | undefined), // 미리듣기 오디오
          image_url: ((v.image_url || v.profile_image_url || undefined) as string | undefined), // 캐릭터 이미지
        };
      });

      // dashboard API가 한글명/이미지/언어를 모두 제공 → 별도 병합 불필요
      cachedVoices = voices;
      fetchPromise = null;
      const withImage = voices.filter(v => v.image_url).length;
      const withKorean = voices.filter(v => /[\uAC00-\uD7AF]/.test(v.name)).length;
      logger.success(`[Typecast] ${voices.length}개 음성 로드 (이미지 ${withImage}개, 한글명 ${withKorean}개)`);
      return voices;
    } catch (err) {
      // API 실패 시 내장 카탈로그 폴백
      logger.warn(`[Typecast] API 음성 목록 실패, 내장 카탈로그 사용: ${err instanceof Error ? err.message : err}`);
      cachedVoices = BUILTIN_TYPECAST_VOICES;
      fetchPromise = null;
      return BUILTIN_TYPECAST_VOICES;
    }
  })();

  return fetchPromise;
};

export const clearTypecastVoiceCache = (): void => {
  cachedVoices = null;
  fetchPromise = null;
};

// === TTS Generation ===

/** 모델별 감정 프리셋 유효성 검증 — 지원하지 않는 감정은 'normal'로 폴백 */
const validateEmotionForModel = (
  model: string,
  preset: string,
): string => {
  if (model === 'ssfm-v21') {
    // v21: whisper, tonedown 미지원 → normal 폴백
    if (!V21_EMOTIONS.includes(preset)) return 'normal';
  } else {
    // v30: tonemid 미지원 → normal 폴백
    if (!V30_EMOTIONS.includes(preset)) return 'normal';
  }
  return preset;
};

export const generateTypecastTTS = async (
  text: string,
  options: TypecastTTSOptions,
): Promise<TypecastTTSResult> => {
  const apiKey = getTypecastKey();
  if (!apiKey) throw new Error('Typecast API 키가 설정되지 않았습니다.');
  if (!text.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

  // 모델 호환성: voice가 선택 모델을 지원하지 않으면 자동 폴백
  const requestedModel = options.model || 'ssfm-v30';
  if (cachedVoices) {
    const voice = cachedVoices.find(v => v.voice_id === options.voiceId);
    if (voice && voice.models.length > 0 && !voice.models.includes(requestedModel)) {
      options = { ...options, model: voice.models[0] as 'ssfm-v30' | 'ssfm-v21' };
      // Smart Emotion은 ssfm-v30에서만 지원
      if (options.model !== 'ssfm-v30' && options.emotionMode === 'smart') {
        options = { ...options, emotionMode: 'preset', emotionPreset: 'normal' };
      }
    }
  }

  // 감정 프리셋 검증: 모델별 지원하지 않는 감정 → normal 폴백
  const effectiveModel = options.model || 'ssfm-v30';
  if (options.emotionPreset) {
    const validated = validateEmotionForModel(effectiveModel, options.emotionPreset);
    if (validated !== options.emotionPreset) {
      options = { ...options, emotionPreset: validated as TypecastTTSOptions['emotionPreset'] };
    }
  }

  if (text.length > TYPECAST_MAX_CHARS) {
    return generateChunked(text, options, apiKey);
  }
  return generateSingle(text, options, apiKey);
};

const generateSingle = async (
  text: string,
  options: TypecastTTSOptions,
  apiKey: string,
): Promise<TypecastTTSResult> => {
  const {
    voiceId,
    model = 'ssfm-v30',
    language = 'kor',
    emotionMode = 'smart',
    emotionPreset = 'normal',
    emotionIntensity = 1.0,
    speed = 1.0,
    pitch = 0,
    volume = 100,
    audioFormat = 'wav',
    previousText,
    nextText,
  } = options;

  // Fix #1: ssfm-v21은 emotion_type 필드를 지원하지 않음
  const prompt: Record<string, unknown> = {};
  if (model === 'ssfm-v21') {
    // v21: emotion_type 없이 emotion_preset + emotion_intensity만 전송
    prompt.emotion_preset = emotionPreset;
    prompt.emotion_intensity = Math.max(0, Math.min(2.0, emotionIntensity));
  } else {
    // v30: SmartPrompt 또는 PresetPrompt
    if (emotionMode === 'smart') {
      prompt.emotion_type = 'smart';
      // Fix #4: optional 필드는 값이 있을 때만 포함
      if (previousText) prompt.previous_text = previousText;
      if (nextText) prompt.next_text = nextText;
    } else {
      prompt.emotion_type = 'preset';
      prompt.emotion_preset = emotionPreset;
      // Fix #2: intensity 하한을 0으로 변경 (API spec: 0~2)
      prompt.emotion_intensity = Math.max(0, Math.min(2.0, emotionIntensity));
    }
  }

  const body = {
    voice_id: voiceId,
    text,
    model,
    // Fix #3: API는 대문자 ISO 639-3 코드 요구 (KOR, ENG, JPN 등)
    language: language.toUpperCase(),
    prompt,
    output: {
      // Fix #6: volume, audio_pitch는 정수로 반올림
      volume: Math.round(Math.max(0, Math.min(200, volume))),
      audio_pitch: Math.round(Math.max(-12, Math.min(12, pitch))),
      audio_tempo: Math.max(0.5, Math.min(2.0, speed)),
      audio_format: audioFormat,
    },
  };

  const response = await monitoredFetch(`${TYPECAST_BASE_URL}/v1/text-to-speech`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Fix #5: 에러 응답 JSON 파싱으로 상세 메시지 추출
  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 401) throw new Error('Typecast API 키가 유효하지 않습니다.');
    if (response.status === 402) throw new Error('Typecast 크레딧이 부족합니다.');
    if (response.status === 429) throw new Error('Typecast 요청 제한 초과. 잠시 후 다시 시도하세요.');
    try {
      const errJson = JSON.parse(errText);
      const msg = errJson?.message?.msg || errText;
      const code = errJson?.message?.error_code || '';
      throw new Error(`Typecast TTS 오류 (${response.status}${code ? ` ${code}` : ''}): ${msg}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Typecast TTS')) throw e;
      throw new Error(`Typecast TTS 오류 (${response.status}): ${errText}`);
    }
  }

  const audioBlob = await response.blob();
  const mimeType = audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
  const audioUrl = URL.createObjectURL(new Blob([audioBlob], { type: mimeType }));

  return { audioUrl, format: audioFormat };
};

const generateChunked = async (
  text: string,
  options: TypecastTTSOptions,
  apiKey: string,
): Promise<TypecastTTSResult> => {
  // 문장 단위로 분할
  const chunks: string[] = [];
  let current = '';
  const sentences = text.split(/(?<=[.!?。])\s*/);

  for (const sentence of sentences) {
    if ((current + sentence).length > TYPECAST_MAX_CHARS && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  if (chunks.length === 0) chunks.push(text.slice(0, TYPECAST_MAX_CHARS));

  const audioUrls: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkOpts: TypecastTTSOptions = {
      ...options,
      previousText: i > 0 ? chunks[i - 1].slice(-200) : options.previousText,
      nextText: i < chunks.length - 1 ? chunks[i + 1].slice(0, 200) : options.nextText,
    };
    const result = await generateSingle(chunks[i], chunkOpts, apiKey);
    audioUrls.push(result.audioUrl);
  }

  if (audioUrls.length === 1) return { audioUrl: audioUrls[0], format: options.audioFormat || 'wav' };

  // Web Audio API로 병합
  const ctx = new AudioContext();
  const buffers: AudioBuffer[] = [];
  for (const url of audioUrls) {
    // Fix #7: monitoredFetch 래퍼 사용
    const resp = await monitoredFetch(url);
    const arrayBuf = await resp.arrayBuffer();
    buffers.push(await ctx.decodeAudioData(arrayBuf));
  }

  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const merged = ctx.createBuffer(1, totalLength, buffers[0]?.sampleRate || 44100);
  let offset = 0;
  for (const buf of buffers) {
    merged.getChannelData(0).set(buf.getChannelData(0), offset);
    offset += buf.length;
  }

  // AudioBuffer → WAV blob
  const wavBlob = audioBufferToWav(merged);
  const mergedUrl = URL.createObjectURL(wavBlob);

  // 개별 chunk blob URL 해제
  audioUrls.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
  await ctx.close();

  return { audioUrl: mergedUrl, format: 'wav' };
};

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, length - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length - 44, true);

  let pos = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      pos += 2;
    }
  }

  return new Blob([out], { type: 'audio/wav' });
}
