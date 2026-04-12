import { create } from 'zustand';
import type { AiChatMessage, AiChatSession, AiChatModel } from '../types';
import { evolinkChatStream, evolinkClaudeStream } from '../services/evolinkService';
import type { EvolinkChatMessage } from '../services/evolinkService';
import { logger } from '../services/LoggerService';
import { fetchYouTubeVideoMeta } from '../services/youtubeVideoMetaService';
import { extractYouTubeVideoId } from '../utils/thumbnailUtils';

const STORAGE_KEY_PREFIX = 'ai-chat-sessions';
const MAX_SESSIONS = 50;
const YOUTUBE_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=[^\s<>"']+|shorts\/[^\s<>"']+|embed\/[^\s<>"']+|v\/[^\s<>"']+)|youtu\.be\/[^\s<>"']+)/gi;

const generateId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 현재 로그인된 사용자 ID 기반 스토리지 키 (다계정 분리) */
const getStorageKey = (): string => {
  try {
    // localStorage 우선, sessionStorage 폴백 (rememberMe=false 대응)
    const userRaw = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (user?.uid) return `${STORAGE_KEY_PREFIX}-${user.uid}`;
    }
  } catch { /* fallback */ }
  return STORAGE_KEY_PREFIX;
};

/** localStorage에서 세션 목록 복원 */
const loadSessions = (): AiChatSession[] => {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/** localStorage에 세션 목록 저장 (imageUrls 제외 — 5MB 한도 보호) */
const saveSessions = (sessions: AiChatSession[]) => {
  try {
    const cleaned = sessions.slice(0, MAX_SESSIONS).map(s => ({
      ...s,
      messages: s.messages.map(m => {
        if (!m.imageUrls?.length) return m;
        const { imageUrls: _removed, ...rest } = m;
        return rest;
      }),
    }));
    localStorage.setItem(getStorageKey(), JSON.stringify(cleaned));
  } catch (e) {
    logger.warn('[ChatStore] 세션 저장 실패', { error: e instanceof Error ? e.message : String(e) });
  }
};

/** 첫 메시지에서 제목 자동 생성 (최대 30자) */
const generateTitle = (content: string): string => {
  const clean = content.replace(/\n/g, ' ').trim();
  return clean.length > 30 ? clean.slice(0, 27) + '...' : clean || '새 대화';
};

const normalizeYouTubeCandidate = (value: string): string =>
  value.match(/^https?:\/\//i) ? value : `https://${value}`;

const trimUrlPunctuation = (value: string): string =>
  value.replace(/[)>.,!?]+$/g, '');

const extractYouTubeUrls = (content: string): string[] => {
  const matches = content.match(YOUTUBE_URL_PATTERN) || [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const match of matches) {
    const normalizedUrl = normalizeYouTubeCandidate(trimUrlPunctuation(match.trim()));
    const videoId = extractYouTubeVideoId(normalizedUrl);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    urls.push(`https://www.youtube.com/watch?v=${videoId}`);
  }

  return urls;
};

const trimInlineText = (value: string, limit: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
};

const buildYouTubeContextNote = async (content: string): Promise<string | undefined> => {
  const urls = extractYouTubeUrls(content).slice(0, 3);
  if (urls.length === 0) return undefined;

  const summaries = await Promise.all(urls.map(async (url) => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) return `- 링크: ${url}`;

    try {
      const metaResult = await fetchYouTubeVideoMeta(videoId);
      const meta = metaResult.meta;
      if (!meta) return `- 링크: ${url}`;

      const lines = [
        `- 링크: ${url}`,
        meta.title ? `  제목: ${trimInlineText(meta.title, 120)}` : '',
        meta.channelTitle ? `  채널: ${trimInlineText(meta.channelTitle, 80)}` : '',
        meta.description ? `  설명: ${trimInlineText(meta.description, 220)}` : '',
      ].filter(Boolean);

      if (meta.tags.length > 0) {
        lines.push(`  태그: ${meta.tags.slice(0, 5).join(', ')}`);
      }

      return lines.join('\n');
    } catch (error) {
      logger.trackSwallowedError('ChatStore:fetchYouTubeMeta', error);
      return `- 링크: ${url}`;
    }
  }));

  return summaries.length > 0
    ? `[YouTube 링크 참고 정보]\n${summaries.join('\n')}`
    : undefined;
};

const getMessageContentForModel = (message: AiChatMessage): string =>
  message.contextNote?.trim()
    ? `${message.content}\n\n${message.contextNote}`
    : message.content;

interface ChatStore {
  sessions: AiChatSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  abortController: AbortController | null;

  // Derived
  activeSession: () => AiChatSession | null;

  // Actions
  createSession: (model?: AiChatModel, systemPrompt?: string) => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  setModel: (model: AiChatModel) => void;
  setSystemPrompt: (prompt: string) => void;
  sendMessage: (content: string, imageUrls?: string[]) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
  reloadSessions: () => void;
}

const initialSessions = loadSessions();

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: initialSessions,
  activeSessionId: initialSessions.length > 0 ? initialSessions[0].id : null,
  isStreaming: false,
  abortController: null,

  activeSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find(s => s.id === activeSessionId) || null;
  },

  createSession: (model = 'gemini-3.1-pro-preview', systemPrompt = '') => {
    const id = generateId();
    const session: AiChatSession = {
      id,
      title: '새 대화',
      messages: [],
      model,
      systemPrompt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set(state => {
      const sessions = [session, ...state.sessions].slice(0, MAX_SESSIONS);
      saveSessions(sessions);
      return { sessions, activeSessionId: id };
    });
    return id;
  },

  deleteSession: (id) => {
    set(state => {
      const sessions = state.sessions.filter(s => s.id !== id);
      saveSessions(sessions);
      const activeSessionId = state.activeSessionId === id ? null : state.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  setModel: (model) => {
    const { activeSessionId } = get();
    if (!activeSessionId) {
      // 세션이 없으면 해당 모델로 새 세션 자동 생성
      get().createSession(model);
      return;
    }
    set(state => {
      const sessions = state.sessions.map(s =>
        s.id === state.activeSessionId ? { ...s, model, updatedAt: Date.now() } : s
      );
      saveSessions(sessions);
      return { sessions };
    });
  },

  setSystemPrompt: (prompt) => {
    const { activeSessionId } = get();
    if (!activeSessionId) {
      const id = get().createSession('gemini-3.1-pro-preview', prompt);
      // createSession이 이미 세션에 systemPrompt를 설정하므로 추가 작업 불필요
      void id;
      return;
    }
    set(state => {
      const sessions = state.sessions.map(s =>
        s.id === state.activeSessionId ? { ...s, systemPrompt: prompt, updatedAt: Date.now() } : s
      );
      saveSessions(sessions);
      return { sessions };
    });
  },

  sendMessage: async (content: string, imageUrls?: string[]) => {
    const { activeSessionId, sessions, isStreaming } = get();
    if (isStreaming) return;

    // 세션이 없으면 자동 생성
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = get().createSession();
    }

    const session = sessions.find(s => s.id === sessionId)
      || get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    // 사용자 메시지 추가
    const userMsg: AiChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      imageUrls: imageUrls?.length ? imageUrls : undefined,
      timestamp: Date.now(),
    };

    // 제목 자동 설정 (첫 메시지)
    const isFirstMessage = session.messages.length === 0;

    const assistantMsg: AiChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      model: session.model,
      timestamp: Date.now(),
    };

    const abortController = new AbortController();

    set(state => {
      const sessions = state.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: [...s.messages, userMsg, assistantMsg],
          title: isFirstMessage ? generateTitle(content) : s.title,
          updatedAt: Date.now(),
        };
      });
      saveSessions(sessions);
      return { sessions, isStreaming: true, abortController };
    });

    try {
      const contextNote = await buildYouTubeContextNote(content);
      if (contextNote) {
        set(state => {
          const sessions = state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              messages: s.messages.map(m => m.id === userMsg.id ? { ...m, contextNote } : m),
              updatedAt: Date.now(),
            };
          });
          saveSessions(sessions);
          return { sessions };
        });
      }

      const model = session.model;
      const isClaude = model.startsWith('claude-');
      const userMsgForModel = contextNote ? { ...userMsg, contextNote } : userMsg;

      // 대화 히스토리 구성
      const history = [...session.messages, userMsgForModel];

      if (isClaude) {
        // Claude: system prompt + 마지막 user 메시지만 (Messages API 제약)
        // 대화 히스토리를 system prompt에 포함
        let systemForClaude = session.systemPrompt || '';
        if (history.length > 1) {
          const historyText = history.slice(0, -1).map(m =>
            `${m.role === 'user' ? 'Human' : 'Assistant'}: ${getMessageContentForModel(m)}`
          ).join('\n\n');
          systemForClaude += (systemForClaude ? '\n\n' : '') + `<conversation_history>\n${historyText}\n</conversation_history>`;
        }

        await evolinkClaudeStream(
          systemForClaude,
          getMessageContentForModel(userMsgForModel),
          (_chunk, accumulated) => {
            set(state => {
              const sessions = state.sessions.map(s => {
                if (s.id !== sessionId) return s;
                const msgs = [...s.messages];
                const lastIdx = msgs.length - 1;
                msgs[lastIdx] = { ...msgs[lastIdx], content: accumulated };
                return { ...s, messages: msgs, updatedAt: Date.now() };
              });
              return { sessions };
            });
          },
          {
            model: model as 'claude-sonnet-4-6' | 'claude-opus-4-6',
            temperature: 0.7,
            maxTokens: 16000,
            signal: abortController.signal,
          }
        );
      } else {
        // Gemini: OpenAI 호환 messages 배열 (이미지 첨부 시 content parts 배열)
        const messages: EvolinkChatMessage[] = [];
        if (session.systemPrompt) {
          messages.push({ role: 'system', content: session.systemPrompt });
        }
        for (const m of history) {
          if (m.imageUrls?.length) {
            // 이미지 + 텍스트 → content parts 배열
            const parts: import('../services/evolinkService').EvolinkContentPart[] = [
              { type: 'text', text: getMessageContentForModel(m) },
              ...m.imageUrls.map(url => ({ type: 'image_url' as const, image_url: { url } })),
            ];
            messages.push({ role: m.role as 'user' | 'assistant', content: parts });
          } else {
            messages.push({ role: m.role as 'user' | 'assistant', content: getMessageContentForModel(m) });
          }
        }

        await evolinkChatStream(
          messages,
          (_chunk, accumulated) => {
            set(state => {
              const sessions = state.sessions.map(s => {
                if (s.id !== sessionId) return s;
                const msgs = [...s.messages];
                const lastIdx = msgs.length - 1;
                msgs[lastIdx] = { ...msgs[lastIdx], content: accumulated };
                return { ...s, messages: msgs, updatedAt: Date.now() };
              });
              return { sessions };
            });
          },
          {
            model,
            temperature: 0.7,
            maxTokens: model.includes('flash') ? 8192 : 16000,
            signal: abortController.signal,
          }
        );
      }

      // 스트리밍 완료 — 최종 저장
      set(state => {
        saveSessions(state.sessions);
        return { isStreaming: false, abortController: null };
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        logger.info('[ChatStore] 스트리밍 사용자 중단');
      } else {
        logger.error('[ChatStore] 스트리밍 실패', { error: e instanceof Error ? e.message : String(e) });
        // 에러 메시지를 assistant 응답에 표시
        set(state => {
          const sessions = state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            const msgs = [...s.messages];
            const lastIdx = msgs.length - 1;
            const errText = e instanceof Error ? e.message : String(e);
            if (!msgs[lastIdx].content) {
              msgs[lastIdx] = { ...msgs[lastIdx], content: `⚠️ 오류: ${errText}` };
            }
            return { ...s, messages: msgs };
          });
          saveSessions(sessions);
          return { sessions };
        });
      }
      set({ isStreaming: false, abortController: null });
    }
  },

  stopStreaming: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ isStreaming: false, abortController: null });
    }
  },

  clearMessages: () => {
    set(state => {
      const sessions = state.sessions.map(s =>
        s.id === state.activeSessionId
          ? { ...s, messages: [], title: '새 대화', updatedAt: Date.now() }
          : s
      );
      saveSessions(sessions);
      return { sessions };
    });
  },

  reloadSessions: () => {
    const fresh = loadSessions();
    set({
      sessions: fresh,
      activeSessionId: fresh.length > 0 ? fresh[0].id : null,
    });
  },
}));
