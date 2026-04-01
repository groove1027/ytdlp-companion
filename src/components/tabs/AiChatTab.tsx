import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { AiChatModel, AiChatSession } from '../../types';

const MODEL_OPTIONS: { id: AiChatModel; label: string; icon: string; desc: string }[] = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', icon: '🌐', desc: '빠르고 저렴한 범용 AI' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini Flash', icon: '⚡', desc: '초고속·초저렴' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', icon: '🟣', desc: '균형잡힌 고품질' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', icon: '🔴', desc: '최고 성능 프리미엄' },
];

const SYSTEM_PRESETS: { label: string; prompt: string }[] = [
  { label: '없음', prompt: '' },
  { label: '유튜브 기획자', prompt: '당신은 유튜브 콘텐츠 기획 전문가입니다. 조회수를 높이는 제목, 썸네일, 기획 아이디어를 제안해주세요. 한국어로 답변하세요.' },
  { label: '카피라이터', prompt: '당신은 숙련된 카피라이터입니다. 매력적이고 클릭을 유도하는 문구를 작성해주세요. 한국어로 답변하세요.' },
  { label: '번역가', prompt: '당신은 전문 번역가입니다. 자연스럽고 문맥에 맞는 번역을 제공해주세요.' },
  { label: '코딩 도우미', prompt: '당신은 시니어 개발자입니다. 깔끔하고 실용적인 코드와 설명을 제공해주세요.' },
];

/** HTML 엔티티 이스케이프 — XSS 방지 */
const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 간단한 마크다운 렌더러 — 코드블록, 볼드, 이탤릭, 리스트 처리 */
function renderMarkdown(text: string): React.ReactNode {
  // 코드블록 분리
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lines = part.slice(3, -3).split('\n');
      const lang = lines[0]?.trim() || '';
      const code = (lang ? lines.slice(1) : lines).join('\n');
      return (
        <pre key={i} className="bg-gray-900/80 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto text-sm">
          {lang && <div className="text-[10px] text-gray-500 mb-1 uppercase">{lang}</div>}
          <code className="text-gray-200 whitespace-pre" dangerouslySetInnerHTML={{ __html: escapeHtml(code) }} />
        </pre>
      );
    }
    // 먼저 HTML 이스케이프 후 마크다운 변환 (XSS 방지)
    const safe = escapeHtml(part);
    const html = safe
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-700/60 px-1.5 py-0.5 rounded text-sm text-emerald-300">$1</code>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

/** 세션 목록 사이드패널 */
function SessionList({ sessions, activeId, onSelect, onDelete, onCreate }: {
  sessions: AiChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="w-64 border-r border-gray-700/50 flex flex-col h-full bg-gray-900/30">
      <div className="p-3 border-b border-gray-700/50">
        <button
          onClick={onCreate}
          className="w-full px-3 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all"
        >
          <span>＋</span> 새 대화
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-4">대화 기록이 없습니다</p>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${
              s.id === activeId
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
            }`}
          >
            <span className="flex-1 truncate">{s.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs"
              title="삭제"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const AiChatTab: React.FC = () => {
  const {
    sessions, activeSessionId, isStreaming,
    createSession, deleteSession, setActiveSession,
    setModel, setSystemPrompt, sendMessage, stopStreaming, clearMessages,
  } = useChatStore();

  const activeSession = useChatStore(s => s.activeSession());
  const messages = activeSession?.messages || [];
  const currentModel = activeSession?.model || 'gemini-3.1-pro-preview';
  const isClaude = currentModel.startsWith('claude-');

  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 텍스트 영역 자동 높이
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  /** File → data URL 변환 */
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** 이미지 파일 추가 (최대 4장, Claude 모델에서는 차단) */
  const addImages = useCallback(async (files: FileList | File[]) => {
    if (isClaude) return; // Claude는 이미지 미지원
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const remaining = 4 - attachedImages.length;
    const toAdd = imageFiles.slice(0, remaining);
    const dataUrls = await Promise.all(toAdd.map(fileToDataUrl));
    setAttachedImages(prev => [...prev, ...dataUrls].slice(0, 4));
  }, [attachedImages.length, isClaude]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedImages.length === 0) || isStreaming) return;
    const images = attachedImages.length > 0 ? [...attachedImages] : undefined;
    setInput('');
    setAttachedImages([]);
    await sendMessage(trimmed || '이 이미지를 분석해주세요.', images);
  }, [input, isStreaming, sendMessage, attachedImages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    createSession(currentModel, activeSession?.systemPrompt || '');
    setAttachedImages([]);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* 사이드: 대화 기록 */}
      {showHistory && (
        <SessionList
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={(id) => { setActiveSession(id); setAttachedImages([]); }}
          onDelete={deleteSession}
          onCreate={handleNewChat}
        />
      )}

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 bg-gray-900/40">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-2.5 py-1.5 rounded-lg text-sm transition-all ${
              showHistory ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title="대화 기록"
          >📋</button>

          {/* 모델 선택 */}
          <select
            value={currentModel}
            onChange={e => { setModel(e.target.value as AiChatModel); if (e.target.value.startsWith('claude-')) setAttachedImages([]); }}
            disabled={isStreaming}
            className="bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          >
            {MODEL_OPTIONS.map(m => (
              <option key={m.id} value={m.id}>{m.icon} {m.label}</option>
            ))}
          </select>

          <span className="text-gray-600 text-xs">
            {MODEL_OPTIONS.find(m => m.id === currentModel)?.desc}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* 시스템 프롬프트 토글 */}
            <button
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className={`px-2.5 py-1.5 rounded-lg text-sm transition-all ${
                showSystemPrompt ? 'bg-amber-600/20 text-amber-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
              title="시스템 프롬프트"
            >⚙️</button>

            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-semibold transition-all"
            >＋ 새 대화</button>

            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                disabled={isStreaming}
                className="px-2.5 py-1.5 text-gray-500 hover:text-red-400 rounded-lg text-sm transition-all disabled:opacity-50"
                title="대화 초기화"
              >🗑️</button>
            )}
          </div>
        </div>

        {/* 시스템 프롬프트 패널 */}
        {showSystemPrompt && (
          <div className="px-4 py-3 border-b border-gray-700/30 bg-gray-900/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-amber-400">시스템 프롬프트</span>
              <div className="flex gap-1">
                {SYSTEM_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setSystemPrompt(p.prompt)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      activeSession?.systemPrompt === p.prompt
                        ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                        : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-gray-700'
                    }`}
                  >{p.label}</button>
                ))}
              </div>
            </div>
            <textarea
              value={activeSession?.systemPrompt || ''}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="AI의 역할이나 행동 규칙을 설정하세요... (선택사항)"
              className="w-full bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-amber-500/50"
              rows={2}
            />
          </div>
        )}

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-5xl mb-4">🤖</div>
              <h2 className="text-xl font-bold text-gray-200 mb-2">AI Chat 플레이그라운드</h2>
              <p className="text-gray-500 text-sm max-w-md">
                도매 API로 저렴하게, 한도 제한 없이 AI와 대화하세요.
                <br />Gemini, Claude 모델을 자유롭게 전환할 수 있습니다.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-w-sm">
                {MODEL_OPTIONS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`px-3 py-2 rounded-lg text-sm text-left transition-all border ${
                      currentModel === m.id
                        ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <span className="mr-1">{m.icon}</span>
                    <span className="font-semibold">{m.label}</span>
                    <div className="text-[10px] text-gray-600 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600/30 text-gray-100 border border-indigo-500/20'
                    : 'bg-gray-800/60 text-gray-200 border border-gray-700/40'
                }`}
              >
                {msg.role === 'assistant' && msg.model && (
                  <div className="text-[10px] text-gray-500 mb-1 font-semibold">
                    {MODEL_OPTIONS.find(m => m.id === msg.model)?.icon} {MODEL_OPTIONS.find(m => m.id === msg.model)?.label}
                  </div>
                )}
                {msg.imageUrls && msg.imageUrls.length > 0 && (
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {msg.imageUrls.map((url, idx) => (
                      <img key={idx} src={url} alt={`첨부 ${idx + 1}`} className="max-w-[180px] max-h-[140px] rounded-lg border border-gray-600/40 object-cover" />
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                  {msg.role === 'assistant' && !msg.content && isStreaming && (
                    <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse rounded-sm ml-0.5" />
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 — 드래그앤드롭 지원 */}
        <div
          className={`px-4 py-3 border-t transition-colors ${
            isDragOver ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700/50 bg-gray-900/40'
          }`}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files.length > 0) addImages(e.dataTransfer.files);
          }}
        >
          {/* 첨부 이미지 미리보기 */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2 max-w-4xl mx-auto">
              {attachedImages.map((url, idx) => (
                <div key={idx} className="relative group">
                  <img src={url} alt={`첨부 ${idx + 1}`} className="w-16 h-16 rounded-lg border border-gray-600 object-cover" />
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >✕</button>
                </div>
              ))}
              {attachedImages.length < 4 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-600 text-gray-500 hover:border-indigo-500 hover:text-indigo-400 flex items-center justify-center text-lg transition-all"
                >＋</button>
              )}
            </div>
          )}
          {isDragOver && (
            <div className="flex items-center justify-center py-2 mb-2 max-w-4xl mx-auto">
              <span className="text-indigo-400 text-sm font-semibold">이미지를 여기에 놓으세요</span>
            </div>
          )}
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            {/* 숨겨진 파일 입력 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) { addImages(e.target.files); e.target.value = ''; } }}
            />
            {/* 📎 버튼 — Claude는 이미지 첨부 미지원 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || attachedImages.length >= 4 || isClaude}
              className="px-3 py-3 text-gray-500 hover:text-indigo-400 rounded-xl text-base transition-all disabled:opacity-30 shrink-0"
              title={isClaude ? 'Claude 모델은 이미지 첨부 미지원 — Gemini를 선택하세요' : '이미지 첨부 (최대 4장, 드래그·붙여넣기 가능)'}
            >📎</button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={e => {
                const items = e.clipboardData.items;
                const imageFiles: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) imageFiles.push(file);
                  }
                }
                if (imageFiles.length > 0) addImages(imageFiles);
              }}
              placeholder={attachedImages.length > 0 ? '이미지에 대해 질문하세요...' : '메시지를 입력하세요... (Shift+Enter로 줄바꿈, 이미지 붙여넣기/드래그 가능)'}
              disabled={isStreaming}
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500 disabled:opacity-50 max-h-[200px]"
            />
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="px-4 py-3 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0"
              >
                ■ 중지
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && attachedImages.length === 0}
                className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0"
              >
                전송 ↑
              </button>
            )}
          </div>
          <p className="text-center text-[10px] text-gray-600 mt-1.5">
            {MODEL_OPTIONS.find(m => m.id === currentModel)?.icon} {MODEL_OPTIONS.find(m => m.id === currentModel)?.label} · 도매 API · 한도 제한 없음 · 📎 이미지 첨부 가능
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiChatTab;
