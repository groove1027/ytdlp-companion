/**
 * Suno AI 음악 생성 — 장르, 무드, 악기, 보컬, 에너지, 프로덕션 태그 전체 카탈로그
 * 출처: Suno 공식 + howtopromptsuno.com + neonsloth.ai (341+ 장르)
 */

/* ═══════ 장르 카탈로그 (10 카테고리, 341+ 장르) ═══════ */

export interface GenreCategory {
  id: string;
  label: string;
  labelKo: string;
  icon: string;
  genres: string[];
}

export const GENRE_CATEGORIES: GenreCategory[] = [
  {
    id: 'rock', label: 'Rock & Metal', labelKo: '록 & 메탈', icon: '🎸',
    genres: [
      'Rock', 'Classic Rock', 'Hard Rock', 'Alternative Rock', 'Indie Rock',
      'Progressive Rock', 'Psychedelic Rock', 'Art Rock', 'Blues Rock',
      'Country Rock', 'Desert Rock', 'Electronic Rock', 'Experimental Rock',
      'Folk Rock', 'Funk Rock', 'Garage Rock', 'Glam Rock', 'Gothic Rock',
      'Grunge', 'Math Rock', 'Noise Rock', 'Post-Rock', 'Post-Punk',
      'Punk Rock', 'Rockabilly', 'Rock and Roll', 'Rock Opera',
      'Shoegaze', 'Skate Rock', 'Soft Rock', 'Southern Rock',
      'Space Rock', 'Stadium Rock', 'Stoner Rock', 'Surf Rock',
      'Symphonic Rock', 'Acid Rock', 'Comedy Rock', 'Instrumental Rock',
      'Piano Rock', 'Pop Rock', 'Rap Rock',
      // Metal
      'Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Thrash Metal',
      'Doom Metal', 'Power Metal', 'Speed Metal', 'Nu Metal',
      'Progressive Metal', 'Symphonic Metal', 'Gothic Metal', 'Folk Metal',
      'Industrial Metal', 'Groove Metal', 'Melodic Death Metal',
      'Melodic Metalcore', 'Metalcore', 'Deathcore', 'Sludge Metal',
      'Viking Metal', 'War Metal', 'Pagan Metal', 'Funk Metal',
      'Rap Metal', 'Avant-garde Metal', 'Experimental Metal',
      'Atmospheric Black Metal', 'Symphonic Black Metal',
      'Kawaii Metal', 'Oriental Metal', 'Scandinavian Metal',
      'Post-Metal', 'New York Hardcore',
    ],
  },
  {
    id: 'electronic', label: 'Electronic & Dance', labelKo: '일렉트로닉 & 댄스', icon: '🎛️',
    genres: [
      'Electronic', 'EDM', 'House', 'Deep House', 'Tech House',
      'Progressive House', 'Future House', 'Tropical House', 'French House',
      'Bass House', 'Vocal House',
      'Techno', 'Minimal Techno', 'Deep Techno', 'Dub Techno',
      'Trance', 'Vocal Trance', 'Psychedelic Trance', 'Goa Trance',
      'Dubstep', 'Brostep', 'Chillstep', 'Post-Dubstep',
      'Drum and Bass', 'Neurofunk', 'Jungle',
      'Ambient', 'Dark Ambient', 'Psybient',
      'Synthwave', 'Retrowave', 'Vaporwave', 'Chillwave',
      'Electro', 'Electropop', 'Electro Swing',
      'Future Bass', 'Future Garage',
      'IDM', 'Glitch', 'Glitch Hop', 'Glitch Pop',
      'Industrial', 'Dark Electro',
      'Hardstyle', 'Gabber', 'Happy Hardcore', 'Rave',
      'Downtempo', 'Trip Hop', 'Lounge',
      'Moombahton', 'Eurodance', 'Space Disco',
      'Nu Disco', 'Post-Disco', 'Disco',
      'UK Garage', 'UK Funky', 'Breakbeat',
      'Hyperpop', 'Witch House', 'Cyberpunk',
      'Dance', 'Dance Pop', 'Club',
      'Electroacoustic', 'Drone',
    ],
  },
  {
    id: 'hiphop', label: 'Hip-Hop & Rap', labelKo: '힙합 & 랩', icon: '🎤',
    genres: [
      'Hip Hop', 'Rap', 'Trap', 'Boom Bap', 'Lo-fi Hip Hop',
      'Old School Hip Hop', 'West Coast Rap', 'Atlanta Rap',
      'Hardcore Rap', 'Mumble Rap', 'Pop Rap', 'Jazz Rap',
      'UK Drill', 'K-Hip-Hop', 'Crunk',
      'Heavy Metal Trap',
    ],
  },
  {
    id: 'pop', label: 'Pop & Contemporary', labelKo: '팝 & 컨템포러리', icon: '🎵',
    genres: [
      'Pop', 'Synth Pop', 'Indie Pop', 'Dream Pop', 'Dance Pop',
      'Electropop', 'Art Pop', 'Bedroom Pop', 'Bubblegum Pop',
      'City Pop', 'Neon Pop', 'Noise Pop', 'Power Pop',
      'Psychedelic Pop', 'Teen Pop',
      'K-Pop', 'J-Pop', 'Latin Pop', 'Europop', 'Thai Pop',
      'Pop Punk', 'Pop Rock',
      'R&B', 'Contemporary R&B', 'Neo Soul', 'Soul', 'Funk',
      'Disco Funk', 'Motown', 'Gospel',
      'Indie', 'Singer-Songwriter', 'Adult Contemporary',
      'Emo', 'Avant-garde', 'Urban Contemporary',
      'Ballad', 'Girl Group',
    ],
  },
  {
    id: 'jazz', label: 'Jazz & Blues', labelKo: '재즈 & 블루스', icon: '🎷',
    genres: [
      'Jazz', 'Smooth Jazz', 'Bebop', 'Cool Jazz', 'Hard Bop',
      'Jazz Fusion', 'Gypsy Jazz', 'Latin Jazz', 'Modal Jazz',
      'New Orleans Jazz', 'Nu Jazz', 'Post-Bop', 'Soul Jazz',
      'Swing', 'Big Band', 'Dark Jazz', 'Acid Jazz',
      'Vocal Jazz', 'Avant-garde Jazz',
      'Blues', 'Delta Blues', 'Chicago Blues', 'Piano Blues',
      'Piedmont Blues', 'Country Blues', 'Punk Blues', 'Blues Rock',
    ],
  },
  {
    id: 'folk', label: 'Folk & World', labelKo: '포크 & 월드', icon: '🌍',
    genres: [
      'Folk', 'Indie Folk', 'Folk Punk', 'Freak Folk', 'Psychedelic Folk',
      'Neofolk', 'Traditional Folk', 'Urban Folk',
      'Country', 'Modern Country', 'Outlaw Country', 'Honky Tonk',
      'Truck Driving Country', 'Bluegrass',
      'Celtic', 'Irish Folk', 'Nordic Folk', 'Russian Folk', 'Spanish Folk',
      'Acoustic', 'Americana', 'Singer-Songwriter',
      // 월드
      'Afrobeat', 'Afro-Cuban', 'African',
      'Latin', 'Salsa', 'Samba', 'Bossa Nova', 'Tango', 'Bolero',
      'Mambo', 'Rumba', 'Reggaeton', 'Bachata', 'Guajira',
      'Flamenco', 'Fado', 'Ranchera', 'Mariachi',
      'Reggae', 'Roots Reggae', 'Dancehall', 'Calypso',
      'Arabian', 'Middle Eastern', 'Rai', 'Sufi Music', 'Qawwali',
      'Indian Classical', 'Hindustani', 'Carnatic', 'Bangra',
      'Klezmer', 'Sephardic', 'Taarab',
      'Hawaiian', 'Sea Shanties', 'Polka', 'Zydeco',
      'World', 'World Beat', 'World Fusion', 'Tribal',
      'Chanson', 'Forró', 'Chalga',
    ],
  },
  {
    id: 'classical', label: 'Classical & Orchestral', labelKo: '클래식 & 오케스트라', icon: '🎻',
    genres: [
      'Classical', 'Baroque', 'Romantic', 'Contemporary Classical',
      'Modern Classical', 'Neoclassical', 'Minimalist',
      'Orchestral', 'Symphonic', 'Symphony', 'Chamber Music',
      'String Quartet', 'Opera', 'Operatic Pop',
      'Sonata', 'Partita', 'Requiem', 'Rhapsody',
      'Adagio', 'Allegro', 'Andante',
      'Classical Crossover', 'Spectralism', 'Serialism',
    ],
  },
  {
    id: 'soundtrack', label: 'Soundtrack & BGM', labelKo: '사운드트랙 & BGM', icon: '🎬',
    genres: [
      'Cinematic', 'Epic', 'Movie Soundtrack', 'Score',
      'Video Game Music', 'TV Themes', 'Spaghetti Western',
      'Villain Theme', 'Audiobook Background', 'Background',
      'Corporate BGM', 'Vlog BGM', 'News BGM', 'Game BGM',
      'Horror BGM', 'Romantic BGM', 'Epic Trailer',
      'Lo-fi BGM', 'Chill BGM', 'Ambient BGM',
    ],
  },
  {
    id: 'vocal', label: 'Vocal & Choral', labelKo: '보컬 & 합창', icon: '🗣️',
    genres: [
      'Acapella', 'Choir', 'Vocal', 'Vocal Jazz',
      'Barbershop', 'Beatboxing', 'Doo Wop',
      'Gregorian Chant', 'Throat Singing', 'Vocaloid',
      'Christmas Carol', 'Broadway',
    ],
  },
  {
    id: 'experimental', label: 'Experimental & Avant-garde', labelKo: '실험 & 아방가르드', icon: '🔬',
    genres: [
      'Experimental', 'Noise', 'No Wave', 'Harsh Noise',
      'Sound Art', 'Sound Collage', 'Tape Music',
      'Musique Concrète', 'Power Electronics',
      'Martial Industrial', 'Dark Cabaret', 'Dungeon Synth',
      'New Age',
    ],
  },
];

/* ═══════ 무드/감정 태그 ═══════ */

export interface TagItem {
  tag: string;
  labelKo: string;
}

export const MOOD_TAGS: TagItem[] = [
  { tag: 'Uplifting', labelKo: '희망적' },
  { tag: 'Melancholic', labelKo: '우울한' },
  { tag: 'Joyful', labelKo: '즐거운' },
  { tag: 'Dark', labelKo: '어두운' },
  { tag: 'Romantic', labelKo: '로맨틱' },
  { tag: 'Nostalgic', labelKo: '향수' },
  { tag: 'Epic', labelKo: '장대한' },
  { tag: 'Dreamy', labelKo: '몽환적' },
  { tag: 'Peaceful', labelKo: '평화로운' },
  { tag: 'Haunting', labelKo: '으스스한' },
  { tag: 'Mysterious', labelKo: '신비로운' },
  { tag: 'Aggressive', labelKo: '공격적' },
  { tag: 'Playful', labelKo: '장난스런' },
  { tag: 'Intimate', labelKo: '친밀한' },
  { tag: 'Bittersweet', labelKo: '씁쓸한' },
  { tag: 'Triumphant', labelKo: '승리감' },
  { tag: 'Anxious', labelKo: '불안한' },
  { tag: 'Euphoric', labelKo: '황홀한' },
  { tag: 'Somber', labelKo: '침울한' },
  { tag: 'Intense', labelKo: '강렬한' },
  { tag: 'Emotional', labelKo: '감성적' },
  { tag: 'Festive', labelKo: '축제' },
  { tag: 'Anthemic', labelKo: '찬가풍' },
  { tag: 'Sensitive', labelKo: '섬세한' },
  { tag: 'Narrative', labelKo: '서사적' },
];

/* ═══════ 에너지 레벨 ═══════ */

export const ENERGY_TAGS: TagItem[] = [
  { tag: 'Low Energy', labelKo: '저에너지' },
  { tag: 'Relaxed', labelKo: '릴랙스' },
  { tag: 'Chill', labelKo: '칠' },
  { tag: 'Steady', labelKo: '안정적' },
  { tag: 'Medium Energy', labelKo: '중간' },
  { tag: 'Building', labelKo: '점층적' },
  { tag: 'Driving', labelKo: '드라이빙' },
  { tag: 'High Energy', labelKo: '고에너지' },
  { tag: 'Explosive', labelKo: '폭발적' },
  { tag: 'Frantic', labelKo: '광적' },
];

/* ═══════ 악기 태그 ═══════ */

export interface InstrumentCategory {
  label: string;
  labelKo: string;
  instruments: string[];
}

export const INSTRUMENT_CATEGORIES: InstrumentCategory[] = [
  {
    label: 'Keys', labelKo: '건반',
    instruments: [
      'Piano', 'Electric Piano', 'Rhodes', 'Wurlitzer',
      'Organ', 'Hammond Organ', 'Synth', 'Analog Synth',
      'Moog Synth', 'Synth Pad', 'Harpsichord', 'Clavinet',
    ],
  },
  {
    label: 'Strings', labelKo: '현악',
    instruments: [
      'Acoustic Guitar', 'Electric Guitar', 'Distorted Guitar',
      'Guitar Solo', 'Bass Guitar', 'Slap Bass', 'Upright Bass',
      'Violin', 'Strings', 'String Quartet', 'Cello', 'Harp',
      'Ukulele', 'Banjo', 'Mandolin', 'Sitar',
    ],
  },
  {
    label: 'Drums', labelKo: '드럼/퍼커션',
    instruments: [
      'Drums', 'Acoustic Drums', 'Electronic Drums',
      '808s', '808 Bass', 'Drum Machine', 'TR-909',
      'Breakbeat', 'Brush Drums', 'Percussion',
      'Taiko Drums', 'Congas', 'Bongos', 'Tambourine', 'Handclaps',
    ],
  },
  {
    label: 'Brass & Wind', labelKo: '관악',
    instruments: [
      'Saxophone', 'Tenor Sax', 'Alto Sax', 'Trumpet',
      'Trombone', 'French Horn', 'Brass Section',
      'Flute', 'Clarinet', 'Harmonica', 'Accordion',
    ],
  },
  {
    label: 'Electronic', labelKo: '일렉트로닉',
    instruments: [
      'Synth Bass', 'Arpeggiated Synth', 'Lead Synth',
      'Synth Stabs', 'Pad', 'Pluck Synth',
      'Acid Bass', 'Supersaw', 'Wobbly Bass', 'Glitch',
    ],
  },
  {
    label: 'Orchestral', labelKo: '오케스트라',
    instruments: [
      'Orchestra', 'Full Orchestra', 'Chamber Orchestra',
      'Orchestral Strings', 'Brass Stabs', 'Timpani',
      'Choir Vocals', 'Cinematic Percussion',
    ],
  },
];

/* ═══════ 보컬 스타일 ═══════ */

export const VOCAL_STYLES = {
  gender: [
    { tag: 'Male Vocal', labelKo: '남성' },
    { tag: 'Female Vocal', labelKo: '여성' },
    { tag: 'Duet', labelKo: '듀엣' },
    { tag: 'Choir', labelKo: '합창' },
  ],
  style: [
    { tag: 'Whisper', labelKo: '속삭임' },
    { tag: 'Spoken Word', labelKo: '낭독' },
    { tag: 'Rap', labelKo: '랩' },
    { tag: 'Harmonies', labelKo: '하모니' },
    { tag: 'Falsetto', labelKo: '팔세토' },
    { tag: 'Belting', labelKo: '벨팅' },
    { tag: 'Growl', labelKo: '그라울' },
    { tag: 'Crooning', labelKo: '크루닝' },
    { tag: 'Operatic', labelKo: '오페라틱' },
    { tag: 'Scat', labelKo: '스캣' },
  ],
  tone: [
    { tag: 'Airy', labelKo: '공기감' },
    { tag: 'Breathy', labelKo: '브레시' },
    { tag: 'Crisp', labelKo: '맑은' },
    { tag: 'Deep', labelKo: '깊은' },
    { tag: 'Gritty', labelKo: '거친' },
    { tag: 'Smooth', labelKo: '부드러운' },
    { tag: 'Warm', labelKo: '따뜻한' },
    { tag: 'Bright', labelKo: '밝은' },
  ],
  effects: [
    { tag: 'AutoTune', labelKo: '오토튠' },
    { tag: 'Reverb', labelKo: '리버브' },
    { tag: 'Delay', labelKo: '딜레이' },
    { tag: 'Distorted Vocals', labelKo: '디스토션' },
    { tag: 'Filtered Vocals', labelKo: '필터' },
    { tag: 'Vocoder', labelKo: '보코더' },
    { tag: 'Telephone Effect', labelKo: '전화 효과' },
  ],
  emotion: [
    { tag: 'Vulnerable', labelKo: '취약한' },
    { tag: 'Powerful', labelKo: '파워풀' },
    { tag: 'Soft', labelKo: '소프트' },
    { tag: 'Aggressive', labelKo: '공격적' },
    { tag: 'Melancholic', labelKo: '우울한' },
    { tag: 'Joyful', labelKo: '즐거운' },
    { tag: 'Sultry', labelKo: '관능적' },
    { tag: 'Defiant', labelKo: '반항적' },
  ],
};

/* ═══════ 프로덕션/텍스처 태그 ═══════ */

export const PRODUCTION_TAGS: TagItem[] = [
  { tag: 'Lo-fi', labelKo: '로파이' },
  { tag: 'Gritty', labelKo: '거친' },
  { tag: 'Clean', labelKo: '깔끔한' },
  { tag: 'Raw', labelKo: '날것' },
  { tag: 'Lush', labelKo: '풍성한' },
  { tag: 'Sparse', labelKo: '스파스' },
  { tag: 'Tape-Saturated', labelKo: '테이프감' },
  { tag: 'Vinyl Hiss', labelKo: '바이닐' },
  { tag: 'Atmospheric', labelKo: '몽환적' },
  { tag: 'Punchy', labelKo: '펀치감' },
  { tag: 'Warm', labelKo: '따뜻한' },
  { tag: 'Polished', labelKo: '세련된' },
  { tag: 'Minimal', labelKo: '미니멀' },
  { tag: 'Vintage', labelKo: '빈티지' },
];

/* ═══════ BPM 프리셋 ═══════ */

export const BPM_PRESETS = [
  { label: 'Molto Lento', labelKo: '매우 느림', bpm: 60 },
  { label: 'Adagio', labelKo: '느림', bpm: 72 },
  { label: 'Andante', labelKo: '걷는 속도', bpm: 85 },
  { label: 'Moderato', labelKo: '보통', bpm: 100 },
  { label: 'Allegretto', labelKo: '약간 빠름', bpm: 112 },
  { label: 'Allegro', labelKo: '빠름', bpm: 130 },
  { label: 'Vivace', labelKo: '활발', bpm: 145 },
  { label: 'Presto', labelKo: '매우 빠름', bpm: 170 },
  { label: 'Prestissimo', labelKo: '극빠름', bpm: 200 },
];

/* ═══════ 길이 프리셋 ═══════ */

export const DURATION_PRESETS = [
  { label: '30초', sec: 30 },
  { label: '1분', sec: 60 },
  { label: '2분', sec: 120 },
  { label: '3분', sec: 180 },
  { label: '4분', sec: 240 },
  { label: '6분', sec: 360 },
  { label: '8분', sec: 480 },
];

/* ═══════ 구조 태그 (가사 작성용) ═══════ */

export const STRUCTURE_TAGS = [
  '[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Post-Chorus]',
  '[Bridge]', '[Outro]', '[Hook]',
  '[Break]', '[Drop]', '[Buildup]', '[Fade Out]', '[Fade In]',
  '[Instrumental]', '[Interlude]', '[Solo]',
  '[Guitar Solo]', '[Rap Verse]', '[Spoken Word]',
  '[Male Vocal]', '[Female Vocal]', '[Whisper]',
];

/* ═══════ 스타일 수식어 ═══════ */

export const STYLE_MODIFIERS: TagItem[] = [
  { tag: 'Aggressive', labelKo: '공격적' },
  { tag: 'Anthemic', labelKo: '찬가풍' },
  { tag: 'Atmospheric', labelKo: '분위기' },
  { tag: 'Calming', labelKo: '진정' },
  { tag: 'Chaotic', labelKo: '혼란' },
  { tag: 'Distorted', labelKo: '왜곡' },
  { tag: 'Ethereal', labelKo: '천상' },
  { tag: 'Groovy', labelKo: '그루비' },
  { tag: 'Love Song', labelKo: '러브송' },
  { tag: 'Party', labelKo: '파티' },
];
