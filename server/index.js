/**
 * yt-dlp API Server
 *
 * YouTube 영상의 스트림 URL만 추출해서 JSON으로 반환합니다.
 * 영상 데이터를 직접 프록시하지 않으므로 서버 트래픽이 최소화됩니다.
 *
 * 아키텍처:
 *   브라우저 → (Cloudflare) → 이 서버 → yt-dlp 실행 → 스트림 URL 추출
 *                                                        ↓
 *   브라우저 ← YouTube CDN에서 직접 다운로드 ←────────────┘
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// ──────────────────────────────────────────────
// 환경변수
// ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3100', 10);
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
const YTDLP_PATH = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// ──────────────────────────────────────────────
// 로깅
// ──────────────────────────────────────────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;

function log(level, message, data) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    if (data) {
      console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

// ──────────────────────────────────────────────
// URL 캐시 (인메모리, 간단하고 빠름)
// ──────────────────────────────────────────────
const urlCache = new Map(); // key: "videoId:quality" → { url, title, duration, cachedAt }
const socialCache = new Map(); // key: urlHash → { data, cachedAt }

function getCacheKey(videoId, quality) {
  return `${videoId}:${quality || 'best'}`;
}

function getCachedUrl(videoId, quality) {
  const key = getCacheKey(videoId, quality);
  const entry = urlCache.get(key);
  if (!entry) return null;

  const age = (Date.now() - entry.cachedAt) / 1000;
  if (age > CACHE_TTL) {
    urlCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedUrl(videoId, quality, data) {
  const key = getCacheKey(videoId, quality);
  urlCache.set(key, { ...data, cachedAt: Date.now() });

  // 캐시 크기 제한 (최대 500개)
  if (urlCache.size > 500) {
    const oldest = urlCache.keys().next().value;
    urlCache.delete(oldest);
  }
}

// 주기적 캐시 정리 (5분마다)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of urlCache) {
    if ((now - entry.cachedAt) / 1000 > CACHE_TTL) {
      urlCache.delete(key);
      cleaned++;
    }
  }
  for (const [key, entry] of socialCache) {
    if ((now - entry.cachedAt) / 1000 > CACHE_TTL) {
      socialCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) log('debug', `Cache cleanup: removed ${cleaned} expired entries`);
}, 5 * 60 * 1000);

// ──────────────────────────────────────────────
// 소셜 URL 해시 (캐시 키용)
// ──────────────────────────────────────────────
const crypto = require('crypto');
function socialCacheKey(url, suffix) {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return suffix ? `${hash}:${suffix}` : hash;
}

// ──────────────────────────────────────────────
// 동시 실행 제한
// ──────────────────────────────────────────────
let activeRequests = 0;

// ──────────────────────────────────────────────
// YouTube URL 검증
// ──────────────────────────────────────────────
function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;

  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // 순수 VIDEO_ID (11자)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  return null;
}

// ──────────────────────────────────────────────
// 소셜 URL 검증 (범용)
// ──────────────────────────────────────────────
const SOCIAL_HOST_WHITELIST = [
  /youtube\.com$/i, /youtu\.be$/i,
  /tiktok\.com$/i, /vm\.tiktok\.com$/i, /vt\.tiktok\.com$/i,
  /douyin\.com$/i, /iesdouyin\.com$/i, /v\.douyin\.com$/i,
  /xiaohongshu\.com$/i, /xhslink\.com$/i, /xhs\.cn$/i,
  /instagram\.com$/i,
  /twitter\.com$/i, /x\.com$/i,
  /facebook\.com$/i, /fb\.watch$/i,
];

function validateSocialUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(normalizedUrl);
    return SOCIAL_HOST_WHITELIST.some(re => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// 범용 스트림 URL 추출 (TikTok, Douyin 등)
// ──────────────────────────────────────────────
async function extractStreamUrlGeneric(rawUrl, quality) {
  const format = buildFormatString(quality);
  const normalizedUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

  log('info', `Extracting (generic): ${normalizedUrl} (quality: ${quality || 'best'})`);

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, [
      '-f', format,
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '-j',
      normalizedUrl,
    ], {
      timeout: 45000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const info = JSON.parse(stdout);

    let streamUrl = info.url;
    if (info.requested_formats && info.requested_formats.length > 0) {
      const videoFormat = info.requested_formats.find(f => f.vcodec !== 'none');
      const audioFormat = info.requested_formats.find(f => f.acodec !== 'none');
      return {
        url: videoFormat ? videoFormat.url : streamUrl,
        audioUrl: audioFormat ? audioFormat.url : null,
        title: info.title || '',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
        width: videoFormat ? videoFormat.width : info.width,
        height: videoFormat ? videoFormat.height : info.height,
        filesize: videoFormat ? videoFormat.filesize : info.filesize,
        format: videoFormat ? videoFormat.format_note : quality,
        codec: videoFormat ? videoFormat.vcodec : info.vcodec,
      };
    }

    return {
      url: streamUrl,
      audioUrl: null,
      title: info.title || '',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      width: info.width,
      height: info.height,
      filesize: info.filesize,
      format: info.format_note || quality,
      codec: info.vcodec,
    };

  } catch (err) {
    const stderr = err.stderr || err.message || '';
    if (err.killed) {
      throw { status: 504, message: 'URL 추출 시간이 초과되었습니다 (45초)' };
    }
    log('error', `yt-dlp (generic) failed:`, stderr.slice(0, 500));
    throw { status: 500, message: 'URL 추출에 실패했습니다' };
  }
}

// ──────────────────────────────────────────────
// yt-dlp 실행 (YouTube 전용)
// ──────────────────────────────────────────────

/**
 * quality 옵션:
 *   'best'  → 최고 화질 (H264)
 *   '1080p' → 1080p H264
 *   '720p'  → 720p H264
 *   '480p'  → 480p H264
 *   '360p'  → 360p H264 (가벼운 분석용)
 *   'audio' → 오디오만
 */
function buildFormatString(quality) {
  switch (quality) {
    case 'audio':
      return 'bestaudio[ext=m4a]/bestaudio';
    case '360p':
      return 'bestvideo[height<=360][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]';
    case '480p':
      return 'bestvideo[height<=480][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]';
    case '720p':
      return 'bestvideo[height<=720][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]';
    case '1080p':
      return 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]';
    case 'best':
    default:
      return 'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
  }
}

async function extractStreamUrl(videoId, quality) {
  const format = buildFormatString(quality);
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  log('info', `Extracting: ${videoId} (quality: ${quality || 'best'})`);

  try {
    // --get-url: 스트림 URL만 출력 (다운로드하지 않음)
    // --no-warnings: 경고 숨김
    // --no-playlist: 단일 영상만
    // -j: JSON 메타데이터 출력
    const { stdout } = await execFileAsync(YTDLP_PATH, [
      '-f', format,
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '-j',  // JSON 출력 (url 포함)
      youtubeUrl,
    ], {
      timeout: 30000,  // 30초 타임아웃
      maxBuffer: 10 * 1024 * 1024,  // 10MB 버퍼
    });

    const info = JSON.parse(stdout);

    // URL 추출: requested_formats → url 필드
    let streamUrl = info.url;

    // 비디오+오디오 분리 스트림인 경우
    if (info.requested_formats && info.requested_formats.length > 0) {
      const videoFormat = info.requested_formats.find(f => f.vcodec !== 'none');
      const audioFormat = info.requested_formats.find(f => f.acodec !== 'none');

      return {
        url: videoFormat ? videoFormat.url : streamUrl,
        audioUrl: audioFormat ? audioFormat.url : null,
        title: info.title || '',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
        width: videoFormat ? videoFormat.width : info.width,
        height: videoFormat ? videoFormat.height : info.height,
        filesize: videoFormat ? videoFormat.filesize : info.filesize,
        format: videoFormat ? videoFormat.format_note : quality,
        codec: videoFormat ? videoFormat.vcodec : info.vcodec,
      };
    }

    return {
      url: streamUrl,
      audioUrl: null,
      title: info.title || '',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      width: info.width,
      height: info.height,
      filesize: info.filesize,
      format: info.format_note || quality,
      codec: info.vcodec,
    };

  } catch (err) {
    // yt-dlp 에러 파싱
    const stderr = err.stderr || err.message || '';

    if (stderr.includes('Video unavailable') || stderr.includes('Private video')) {
      throw { status: 404, message: '영상을 찾을 수 없습니다 (비공개이거나 삭제됨)' };
    }
    if (stderr.includes('Sign in to confirm your age') || stderr.includes('age-restricted')) {
      throw { status: 403, message: '연령 제한 영상입니다' };
    }
    if (stderr.includes('This live event will begin')) {
      throw { status: 400, message: '아직 시작하지 않은 라이브 스트림입니다' };
    }
    if (stderr.includes('Premieres in')) {
      throw { status: 400, message: '아직 공개되지 않은 프리미어 영상입니다' };
    }
    if (err.killed) {
      throw { status: 504, message: 'URL 추출 시간이 초과되었습니다 (30초)' };
    }

    log('error', `yt-dlp failed for ${videoId}:`, stderr.slice(0, 500));
    throw { status: 500, message: 'URL 추출에 실패했습니다' };
  }
}

// ──────────────────────────────────────────────
// Express 앱 설정
// ──────────────────────────────────────────────
const app = express();

// 보안 헤더
app.use(helmet());

// JSON 파싱
app.use(express.json({ limit: '1kb' }));

// CORS 설정
app.use(cors({
  origin: (origin, callback) => {
    // 서버 직접 호출 (origin 없음) 또는 허용 도메인
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 86400,
}));

// Rate Limiting (분당 30회)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 1분 후 다시 시도해주세요.' },
});
app.use(limiter);

// ──────────────────────────────────────────────
// API 키 인증 미들웨어
// ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  if (!API_KEY) {
    // API_KEY가 설정되지 않았으면 인증 스킵 (개발용)
    log('warn', 'No API_KEY configured — authentication disabled');
    return next();
  }

  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.key;

  if (key !== API_KEY) {
    log('warn', `Auth failed from ${req.ip}`);
    return res.status(401).json({ error: '인증에 실패했습니다. API 키를 확인해주세요.' });
  }

  next();
}

// ──────────────────────────────────────────────
// API 라우트
// ──────────────────────────────────────────────

/**
 * GET /health
 * 서버 상태 확인 (인증 불필요)
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.0',
    activeRequests,
    cacheSize: urlCache.size,
    socialCacheSize: socialCache.size,
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * GET /api/extract?url=YOUTUBE_URL&quality=720p
 * POST /api/extract { url: "YOUTUBE_URL", quality: "720p" }
 *
 * YouTube 영상의 스트림 URL을 추출합니다.
 *
 * 파라미터:
 *   url     (필수) — YouTube URL 또는 VIDEO_ID
 *   quality (선택) — best, 1080p, 720p, 480p, 360p, audio (기본: best)
 *
 * 응답:
 *   {
 *     "url": "https://...googlevideo.com/...",
 *     "audioUrl": "https://...googlevideo.com/..." | null,
 *     "title": "영상 제목",
 *     "duration": 180,
 *     "thumbnail": "https://i.ytimg.com/...",
 *     "width": 1920,
 *     "height": 1080,
 *     "filesize": 12345678,
 *     "format": "720p",
 *     "codec": "avc1.64001f",
 *     "cached": false
 *   }
 */
app.get('/api/extract', authMiddleware, handleExtract);
app.post('/api/extract', authMiddleware, handleExtract);

async function handleExtract(req, res) {
  try {
    // 파라미터 추출 (GET: query, POST: body)
    const url = req.query.url || req.body?.url;
    const quality = req.query.quality || req.body?.quality || 'best';

    // URL 검증
    if (!url) {
      return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: '올바른 YouTube URL이 아닙니다' });
    }

    // quality 검증
    const validQualities = ['best', '1080p', '720p', '480p', '360p', 'audio'];
    if (!validQualities.includes(quality)) {
      return res.status(400).json({
        error: `quality는 다음 중 하나여야 합니다: ${validQualities.join(', ')}`
      });
    }

    // 캐시 확인
    const cached = getCachedUrl(videoId, quality);
    if (cached) {
      log('info', `Cache hit: ${videoId} (${quality})`);
      return res.json({ ...cached, cached: true, cachedAt: undefined });
    }

    // 동시 실행 제한
    if (activeRequests >= MAX_CONCURRENT) {
      return res.status(429).json({
        error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.',
        retryAfter: 5,
      });
    }

    activeRequests++;

    try {
      const result = await extractStreamUrl(videoId, quality);

      // 캐시에 저장
      setCachedUrl(videoId, quality, result);

      log('info', `Success: ${videoId} (${quality}) → ${result.width}x${result.height}`);

      res.json({ ...result, cached: false });

    } finally {
      activeRequests--;
    }

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    log('error', 'Unexpected error:', err);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다' });
  }
}

/**
 * POST /api/batch
 * 여러 영상의 스트림 URL을 한번에 추출합니다.
 *
 * 요청:
 *   {
 *     "urls": ["VIDEO_URL_1", "VIDEO_URL_2", ...],
 *     "quality": "720p"
 *   }
 *
 * 응답:
 *   {
 *     "results": [
 *       { "videoId": "xxx", "url": "...", ... },
 *       { "videoId": "yyy", "error": "..." },
 *     ]
 *   }
 *
 * 제한: 최대 10개
 */
app.post('/api/batch', authMiddleware, async (req, res) => {
  try {
    const { urls, quality = 'best' } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls 배열이 필요합니다' });
    }

    if (urls.length > 10) {
      return res.status(400).json({ error: '최대 10개까지 요청할 수 있습니다' });
    }

    const results = await Promise.all(
      urls.map(async (url) => {
        const videoId = extractVideoId(url);
        if (!videoId) {
          return { videoId: null, url: url, error: '올바른 YouTube URL이 아닙니다' };
        }

        // 캐시 확인
        const cached = getCachedUrl(videoId, quality);
        if (cached) {
          return { videoId, ...cached, cached: true, cachedAt: undefined };
        }

        try {
          if (activeRequests >= MAX_CONCURRENT) {
            return { videoId, error: '서버가 바쁩니다' };
          }
          activeRequests++;
          try {
            const result = await extractStreamUrl(videoId, quality);
            setCachedUrl(videoId, quality, result);
            return { videoId, ...result, cached: false };
          } finally {
            activeRequests--;
          }
        } catch (err) {
          return { videoId, error: err.message || 'URL 추출 실패' };
        }
      })
    );

    res.json({ results });

  } catch (err) {
    log('error', 'Batch error:', err);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다' });
  }
});

/**
 * GET /api/info?url=YOUTUBE_URL
 * 영상 메타데이터만 조회합니다 (스트림 URL 없이).
 * 빠르게 제목, 길이, 썸네일만 필요할 때 사용.
 */
app.get('/api/info', authMiddleware, async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: '올바른 YouTube URL이 아닙니다' });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const { stdout } = await execFileAsync(YTDLP_PATH, [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--skip-download',
      '-j',
      youtubeUrl,
    ], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(stdout);

    res.json({
      videoId,
      title: info.title || '',
      description: (info.description || '').slice(0, 500),
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      channel: info.channel || info.uploader || '',
      viewCount: info.view_count || 0,
      uploadDate: info.upload_date || '',
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    log('error', 'Info error:', err);
    res.status(500).json({ error: '메타데이터 조회에 실패했습니다' });
  }
});

/**
 * GET /api/download?url=VIDEO_ID&quality=720p
 * 영상을 서버에서 다운로드하여 브라우저로 스트리밍합니다.
 * (브라우저 CORS 제약 우회용 프록시)
 */
app.get('/api/download', authMiddleware, async (req, res) => {
  const url = req.query.url;
  const quality = req.query.quality || '720p';

  if (!url) {
    return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: '올바른 YouTube URL이 아닙니다' });
  }

  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' });
  }

  activeRequests++;

  try {
    // 캐시 또는 추출
    let result = getCachedUrl(videoId, quality);
    if (!result) {
      result = await extractStreamUrl(videoId, quality);
      setCachedUrl(videoId, quality, result);
    }

    const streamUrl = result.url;
    if (!streamUrl) {
      return res.status(500).json({ error: '스트림 URL 추출 실패' });
    }

    log('info', `Proxy download: ${videoId} (${quality})`);

    // YouTube CDN에서 가져와서 브라우저로 파이프
    const https = require('https');
    const http = require('http');
    const protocol = streamUrl.startsWith('https') ? https : http;

    protocol.get(streamUrl, { timeout: 60000 }, (upstream) => {
      if (upstream.statusCode !== 200) {
        res.status(502).json({ error: `YouTube CDN 응답 오류 (${upstream.statusCode})` });
        upstream.resume();
        return;
      }

      const safeTitle = (result.title || videoId).replace(/[^a-zA-Z0-9가-힣\s._-]/g, '').substring(0, 80);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp4"`);
      if (upstream.headers['content-length']) {
        res.setHeader('Content-Length', upstream.headers['content-length']);
      }

      upstream.pipe(res);

      upstream.on('error', (err) => {
        log('error', `Proxy stream error: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: '스트림 전송 중 오류' });
      });
    }).on('error', (err) => {
      log('error', `Proxy request error: ${err.message}`);
      if (!res.headersSent) res.status(502).json({ error: 'YouTube CDN 연결 실패' });
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    log('error', 'Download proxy error:', err);
    if (!res.headersSent) res.status(500).json({ error: '다운로드 프록시 오류' });
  } finally {
    activeRequests--;
  }
});

// ──────────────────────────────────────────────
// 소셜 미디어 엔드포인트
// ──────────────────────────────────────────────

/**
 * POST /api/social/metadata
 * 소셜 미디어 영상의 메타데이터(캡션, 댓글 등)를 추출합니다.
 *
 * 요청: { url, includeComments? }
 * 응답: { title, description, uploader, platform, duration, thumbnail,
 *         viewCount, likeCount, commentCount, uploadDate, comments[], commentsError? }
 */
app.post('/api/social/metadata', authMiddleware, async (req, res) => {
  try {
    const { url, includeComments } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
    }
    if (!validateSocialUrl(url)) {
      return res.status(400).json({ error: '지원하지 않는 URL입니다' });
    }

    // 캐시 확인
    const cacheKey = socialCacheKey(url, includeComments ? 'comments' : 'meta');
    const cached = socialCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) / 1000 < CACHE_TTL) {
      log('info', `Social metadata cache hit: ${url.slice(0, 60)}`);
      return res.json({ ...cached.data, cached: true });
    }

    if (activeRequests >= MAX_CONCURRENT) {
      return res.status(429).json({ error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.', retryAfter: 5 });
    }

    activeRequests++;

    try {
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      const timeout = includeComments ? 45000 : 15000;

      const args = [
        '--no-warnings',
        '--no-playlist',
        '--no-check-certificates',
        '--skip-download',
        '-j',
      ];

      if (includeComments) {
        args.push('--write-comments');
        args.push('--extractor-args', 'tiktok:comment_count=100');
      }

      args.push(normalizedUrl);

      const { stdout } = await execFileAsync(YTDLP_PATH, args, {
        timeout,
        maxBuffer: 50 * 1024 * 1024, // 댓글 포함 시 큰 JSON 가능
      });

      const info = JSON.parse(stdout);

      // 댓글 파싱
      let comments = [];
      let commentsError = undefined;
      if (includeComments) {
        try {
          const rawComments = info.comments || [];
          comments = rawComments.slice(0, 100).map(c => ({
            author: c.author || c.author_id || '익명',
            text: c.text || '',
            likeCount: c.like_count || 0,
            timestamp: c.timestamp || 0,
          }));
        } catch (e) {
          commentsError = '댓글 파싱에 실패했습니다';
          log('warn', `Comment parsing failed: ${e.message}`);
        }
      }

      const result = {
        title: info.title || '',
        description: info.description || '',
        uploader: info.uploader || info.channel || info.creator || '',
        platform: info.extractor_key || info.extractor || '',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
        viewCount: info.view_count || 0,
        likeCount: info.like_count || 0,
        commentCount: info.comment_count || comments.length || 0,
        uploadDate: info.upload_date || '',
        comments,
        commentsError,
      };

      // 캐시 저장
      socialCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      if (socialCache.size > 500) {
        const oldest = socialCache.keys().next().value;
        socialCache.delete(oldest);
      }

      log('info', `Social metadata success: ${result.platform} — "${result.title?.slice(0, 40)}"`);

      res.json({ ...result, cached: false });

    } finally {
      activeRequests--;
    }

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    log('error', 'Social metadata error:', err);
    res.status(500).json({ error: '메타데이터 조회에 실패했습니다' });
  }
});

/**
 * POST /api/social/download
 * 소셜 미디어 영상을 서버에서 다운로드하여 브라우저로 스트리밍합니다.
 *
 * 요청: { url, quality? }
 */
app.post('/api/social/download', authMiddleware, async (req, res) => {
  const { url, quality = '720p' } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
  }
  if (!validateSocialUrl(url)) {
    return res.status(400).json({ error: '지원하지 않는 URL입니다' });
  }

  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' });
  }

  activeRequests++;

  try {
    // 캐시 확인 또는 추출
    const cacheKey = socialCacheKey(url, `dl:${quality}`);
    let result = socialCache.get(cacheKey);
    if (result && (Date.now() - result.cachedAt) / 1000 < CACHE_TTL) {
      result = result.data;
    } else {
      result = await extractStreamUrlGeneric(url, quality);
      socialCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      if (socialCache.size > 500) {
        const oldest = socialCache.keys().next().value;
        socialCache.delete(oldest);
      }
    }

    const streamUrl = result.url;
    if (!streamUrl) {
      return res.status(500).json({ error: '스트림 URL 추출 실패' });
    }

    log('info', `Social proxy download: ${url.slice(0, 60)} (${quality})`);

    const https = require('https');
    const http = require('http');
    const protocol = streamUrl.startsWith('https') ? https : http;

    protocol.get(streamUrl, { timeout: 60000 }, (upstream) => {
      if (upstream.statusCode !== 200) {
        res.status(502).json({ error: `CDN 응답 오류 (${upstream.statusCode})` });
        upstream.resume();
        return;
      }

      const safeTitle = (result.title || 'download').replace(/[^a-zA-Z0-9가-힣\s._-]/g, '').substring(0, 80);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp4"`);
      if (upstream.headers['content-length']) {
        res.setHeader('Content-Length', upstream.headers['content-length']);
      }

      upstream.pipe(res);

      upstream.on('error', (err) => {
        log('error', `Social proxy stream error: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: '스트림 전송 중 오류' });
      });
    }).on('error', (err) => {
      log('error', `Social proxy request error: ${err.message}`);
      if (!res.headersSent) res.status(502).json({ error: 'CDN 연결 실패' });
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    log('error', 'Social download proxy error:', err);
    if (!res.headersSent) res.status(500).json({ error: '다운로드 프록시 오류' });
  } finally {
    activeRequests--;
  }
});

/**
 * GET /api/version
 * yt-dlp 버전 정보 (인증 불필요)
 */
app.get('/api/version', async (req, res) => {
  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, ['--version'], { timeout: 5000 });
    res.json({ ytdlp: stdout.trim(), server: '1.0.0' });
  } catch {
    res.status(500).json({ error: 'yt-dlp 버전 확인 실패' });
  }
});

// ──────────────────────────────────────────────
// 프레임 추출 엔드포인트 (#340 — AI 타임코드 기반 초고속 프레임)
// ──────────────────────────────────────────────

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * GET /api/frame?url=VIDEO_ID&t=15.5&w=640
 * 특정 타임코드의 프레임을 JPEG로 반환합니다.
 *
 * 파라미터:
 *   url  (필수) — YouTube VIDEO_ID
 *   t    (필수) — 타임코드 (초, 소수점 지원)
 *   w    (선택) — 출력 너비 (기본: 640, 최대: 1280)
 *
 * 응답: image/jpeg 바이너리
 */
app.get('/api/frame', authMiddleware, async (req, res) => {
  const url = req.query.url;
  const timeSec = parseFloat(req.query.t);
  const width = Math.min(parseInt(req.query.w || '640', 10) || 640, 1280);

  if (!url) return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
  if (isNaN(timeSec) || timeSec < 0) return res.status(400).json({ error: 't(타임코드) 파라미터가 필요합니다 (초 단위)' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: '올바른 YouTube URL이 아닙니다' });

  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' });
  }

  activeRequests++;

  try {
    // 1. 스트림 URL 가져오기 (캐시 우선)
    let result = getCachedUrl(videoId, '360p');
    if (!result) {
      result = await extractStreamUrl(videoId, '360p');
      setCachedUrl(videoId, '360p', result);
    }

    const streamUrl = result.url;
    if (!streamUrl) return res.status(500).json({ error: '스트림 URL 추출 실패' });

    log('info', `Frame extract: ${videoId} @ ${timeSec}s (${width}px)`);

    // 2. ffmpeg로 해당 타임코드의 프레임 1장 추출 (JPEG)
    const { execFile: execFileCb } = require('child_process');
    const ffmpegArgs = [
      '-ss', String(timeSec),     // 시크 (입력 전 → 초고속)
      '-i', streamUrl,            // YouTube CDN 스트림
      '-vframes', '1',            // 1프레임만
      '-vf', `scale=${width}:-2`, // 지정 너비, 비율 유지
      '-f', 'image2',             // 이미지 출력
      '-q:v', '3',                // JPEG 품질 (2=최고, 5=보통)
      'pipe:1',                   // stdout으로 출력
    ];

    const ffmpeg = execFileCb(FFMPEG_PATH, ffmpegArgs, {
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'buffer',
    }, (err, stdout) => {
      if (err) {
        log('error', `ffmpeg frame error: ${err.message?.slice(0, 200)}`);
        if (!res.headersSent) res.status(500).json({ error: '프레임 추출 실패' });
        return;
      }

      if (!stdout || stdout.length === 0) {
        if (!res.headersSent) res.status(500).json({ error: '빈 프레임 (타임코드가 영상 범위를 초과했을 수 있음)' });
        return;
      }

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', stdout.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(stdout);
    });

  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log('error', 'Frame extract error:', err);
    if (!res.headersSent) res.status(500).json({ error: '프레임 추출 서버 오류' });
  } finally {
    activeRequests--;
  }
});

/**
 * POST /api/frames
 * 여러 타임코드의 프레임을 한번에 추출 (배치)
 *
 * 요청: { url: "VIDEO_ID", timecodes: [15.5, 30.0, 45.2], w: 640 }
 * 응답: { frames: [{ t: 15.5, url: "data:image/jpeg;base64,..." }, ...] }
 */
app.post('/api/frames', authMiddleware, express.json({ limit: '10kb' }), async (req, res) => {
  const { url, timecodes, w = 640 } = req.body || {};

  if (!url) return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
  if (!Array.isArray(timecodes) || timecodes.length === 0) return res.status(400).json({ error: 'timecodes 배열이 필요합니다' });
  if (timecodes.length > 50) return res.status(400).json({ error: '최대 50개 타임코드까지 요청할 수 있습니다' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: '올바른 YouTube URL이 아닙니다' });

  const width = Math.min(parseInt(w, 10) || 640, 1280);

  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' });
  }

  activeRequests++;

  try {
    // 스트림 URL 가져오기
    let result = getCachedUrl(videoId, '360p');
    if (!result) {
      result = await extractStreamUrl(videoId, '360p');
      setCachedUrl(videoId, '360p', result);
    }

    const streamUrl = result.url;
    if (!streamUrl) return res.status(500).json({ error: '스트림 URL 추출 실패' });

    log('info', `Batch frame extract: ${videoId} × ${timecodes.length} frames (${width}px)`);

    // 병렬 프레임 추출 (최대 5개 동시)
    const CONCURRENCY = 5;
    const frames = [];
    for (let i = 0; i < timecodes.length; i += CONCURRENCY) {
      const batch = timecodes.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(t => new Promise((resolve, reject) => {
          const args = [
            '-ss', String(t),
            '-i', streamUrl,
            '-vframes', '1',
            '-vf', `scale=${width}:-2`,
            '-f', 'image2',
            '-q:v', '4',
            'pipe:1',
          ];
          require('child_process').execFile(FFMPEG_PATH, args, {
            timeout: 10000,
            maxBuffer: 2 * 1024 * 1024,
            encoding: 'buffer',
          }, (err, stdout) => {
            if (err || !stdout || stdout.length === 0) {
              reject(new Error('frame extraction failed'));
            } else {
              resolve({ t, data: stdout.toString('base64') });
            }
          });
        }))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          frames.push({ t: r.value.t, url: `data:image/jpeg;base64,${r.value.data}` });
        }
      }
    }

    log('info', `Batch frame result: ${frames.length}/${timecodes.length} extracted`);
    res.json({ frames, total: timecodes.length, extracted: frames.length });

  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log('error', 'Batch frame error:', err);
    res.status(500).json({ error: '프레임 배치 추출 오류' });
  } finally {
    activeRequests--;
  }
});

// ──────────────────────────────────────────────
// 404 처리
// ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: '존재하지 않는 경로입니다' });
});

// ──────────────────────────────────────────────
// 에러 핸들러
// ──────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.message === 'CORS not allowed') {
    return res.status(403).json({ error: '허용되지 않은 도메인입니다' });
  }
  log('error', 'Unhandled error:', err.message);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다' });
});

// ──────────────────────────────────────────────
// 서버 시작
// ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  log('info', `yt-dlp API Server started on port ${PORT}`);
  log('info', `Auth: ${API_KEY ? 'enabled' : 'DISABLED (no API_KEY set)'}`);
  log('info', `CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
  log('info', `Max concurrent: ${MAX_CONCURRENT}`);
  log('info', `Cache TTL: ${CACHE_TTL}s`);

  // yt-dlp 존재 확인
  execFileAsync(YTDLP_PATH, ['--version'], { timeout: 5000 })
    .then(({ stdout }) => log('info', `yt-dlp version: ${stdout.trim()}`))
    .catch(() => log('error', `yt-dlp not found at ${YTDLP_PATH} — install it first!`));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received — shutting down...');
  process.exit(0);
});
process.on('SIGINT', () => {
  log('info', 'SIGINT received — shutting down...');
  process.exit(0);
});
