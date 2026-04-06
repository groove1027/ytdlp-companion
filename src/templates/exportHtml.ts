
import { Scene, Thumbnail, ProjectConfig, CostStats, SubtitleStyle, SubtitleEntry } from '../types';

export interface ExportData {
    id: string | null;
    title: string;
    config: ProjectConfig;
    scenes: Scene[];
    thumbnails: Thumbnail[];
    costStats: CostStats;
}

export const buildExportHtml = (
    data: ExportData,
    displayTitle: string,
    subtitleFontCss?: string,
    subtitleStyle?: SubtitleStyle | null,
    subtitles?: SubtitleEntry[],
): string => {
    const scriptBody = `
            <script>
                // --- DATA INITIALIZATION ---
                // 'projectData' is already defined in the <script id="project-data"> block above.

                // --- HELPERS ---
                function el(tag, cls, html, attrs = {}) {
                    const e = document.createElement(tag);
                    if(cls) e.className = cls;
                    if(html) e.innerHTML = html;
                    for(const k in attrs) e.setAttribute(k, attrs[k]);
                    return e;
                }

                function showToast(msg) {
                    const t = document.getElementById('toast');
                    t.textContent = msg;
                    t.classList.remove('translate-y-20', 'opacity-0');
                    setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 3000);
                }

                function getSceneNarrationText(scene) {
                    return (scene?.scriptText || scene?.audioScript || '').trim();
                }

                // --- CORE FUNCTIONALITY ---
                function render() {
                    if (typeof projectData === 'undefined') return;

                    // [NEW] RENDER HEADER BADGES
                    const badgeContainer = document.getElementById('project-info-badges');
                    if (badgeContainer) {
                        badgeContainer.innerHTML = '';
                        const c = projectData.config;
                        const addBadge = (text, colorClass, borderClass, textClass) => {
                            badgeContainer.appendChild(el('span', \`px-2 py-1 rounded border text-xs font-bold flex items-center gap-1 \${colorClass} \${borderClass} \${textClass}\`, text));
                        };

                        // 1. Basic Mode
                        addBadge(c.mode === 'SCRIPT' ? (c.isThumbnailOnlyMode ? '🖼️ 썸네일 전용' : '🎬 대본 모드') : c.mode, 'bg-gray-800', 'border-gray-700', 'text-gray-300');
                        addBadge(c.aspectRatio, 'bg-gray-800', 'border-gray-700', 'text-gray-300');

                        // 2. Style
                        if (c.atmosphere) {
                            addBadge(\`🎨 \${c.atmosphere}\`, 'bg-purple-900/30', 'border-purple-700/50', 'text-purple-300');
                        }

                        // 3. Split Mode
                        if (c.smartSplit) {
                            addBadge('🤖 AI 자동 분할', 'bg-indigo-900/30', 'border-indigo-500/50', 'text-indigo-300');
                        } else {
                            addBadge('✂️ 수동 분할', 'bg-orange-900/30', 'border-orange-500/50', 'text-orange-300');
                        }

                        // 4. Options
                        if (c.allowInfographics) addBadge('📊 인포그래픽', 'bg-blue-900/30', 'border-blue-500/50', 'text-blue-300');
                        if (c.textForceLock) addBadge('🔠 텍스트 고정', 'bg-red-900/30', 'border-red-500/50', 'text-red-300');
                        if (c.characterImage) addBadge('👤 캐릭터 적용', 'bg-emerald-900/30', 'border-emerald-500/50', 'text-emerald-300');
                        if (c.isMixedMedia) addBadge('🔀 Mixed Media', 'bg-pink-900/30', 'border-pink-500/50', 'text-pink-300');
                    }

                    // [NEW] RENDER THUMBNAILS (IMPROVED UI)
                    const thumbContainer = document.getElementById('thumbnail-grid');
                    if (thumbContainer && projectData.thumbnails && projectData.thumbnails.length > 0) {
                        thumbContainer.innerHTML = '';
                        projectData.thumbnails.forEach((thumb, index) => {
                            const card = el('div', 'bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col hover:border-green-500/50 transition-colors shadow-lg group relative');

                            let aspectClass = 'aspect-video';
                            if (thumb.format === 'short') aspectClass = 'aspect-[9/16]';

                            // Image Container with click-to-lightbox
                            const imgContainer = el('div', \`relative \${aspectClass} bg-black cursor-zoom-in group/img overflow-hidden\`);
                            imgContainer.onclick = () => {
                                if (thumb.imageUrl) {
                                    // Manually open generic lightbox
                                    const modal = document.getElementById('lightbox-modal');
                                    const img = document.getElementById('lightbox-img');
                                    const btn = document.getElementById('lightbox-dl-btn');
                                    img.src = thumb.imageUrl;
                                    btn.onclick = (e) => {
                                        e.stopPropagation();
                                        downloadSingleImage(thumb.imageUrl, \`thumbnail_\${index+1}.png\`);
                                    };
                                    modal.classList.remove('hidden');
                                }
                            };

                            if (thumb.imageUrl) {
                                const img = el('img', 'w-full h-full object-cover', '', { src: thumb.imageUrl });
                                imgContainer.appendChild(img);
                                const overlay = el('div', 'absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none');
                                overlay.appendChild(el('span', 'text-white text-3xl font-bold drop-shadow-md', '🔍'));
                                imgContainer.appendChild(overlay);
                            } else {
                                imgContainer.appendChild(el('div', 'flex items-center justify-center h-full text-gray-600 text-sm', 'No Image'));
                            }
                            card.appendChild(imgContainer);

                            // Footer with Text Overlay Badge
                            const footer = el('div', 'p-3 bg-gray-900/50 border-t border-gray-700 flex flex-col gap-2');

                            // 1. Tags Row
                            const tagsRow = el('div', 'flex justify-between items-center');
                            const typeBadge = el('span', \`text-xs font-bold px-2 py-0.5 rounded \${thumb.format === 'short' ? 'bg-pink-900/30 text-pink-300 border border-pink-500/30' : 'bg-blue-900/30 text-blue-300 border border-blue-500/30'}\`, thumb.format === 'short' ? 'Shorts' : 'Long-form');
                            tagsRow.appendChild(typeBadge);

                            if (thumb.imageUrl) {
                                const dlBtn = el('button', 'text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded transition-colors', '💾 저장');
                                dlBtn.onclick = (e) => {
                                    e.stopPropagation();
                                    downloadSingleImage(thumb.imageUrl, \`thumbnail_\${index+1}.png\`);
                                };
                                tagsRow.appendChild(dlBtn);
                            }
                            footer.appendChild(tagsRow);

                            // 2. Text Overlay Badge (Moved to footer)
                            if (thumb.textOverlay) {
                                const textBadge = el('div', 'bg-black/40 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-700 font-medium leading-tight', \`📝 "\${thumb.textOverlay}"\`);
                                footer.appendChild(textBadge);
                            }

                            card.appendChild(footer);
                            thumbContainer.appendChild(card);
                        });
                    } else if (thumbContainer) {
                        thumbContainer.innerHTML = '<div class="col-span-full text-center text-gray-600 py-8 border-2 border-dashed border-gray-800 rounded-xl">생성된 썸네일이 없습니다.</div>';
                    }

                    // RENDER SCENES (Original Logic)
                    const container = document.getElementById('scene-grid');
                    container.innerHTML = '';
                    const ratio = projectData.config.aspectRatio;
                    let aspectClass = 'aspect-video';
                    if (ratio === '9:16') aspectClass = 'aspect-[9/16]';
                    else if (ratio === '1:1') aspectClass = 'aspect-square';
                    else if (ratio === '4:3') aspectClass = 'aspect-[4/3]';

                    projectData.scenes.forEach((scene, index) => {
                        const card = el('div', 'bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col hover:border-blue-500/50 transition-colors shadow-lg group relative');
                        const header = el('div', 'px-4 py-3 bg-gray-900/50 border-b border-gray-700 flex flex-wrap gap-2 items-center');
                        header.appendChild(el('span', 'text-xs font-bold px-2 py-1 rounded bg-blue-600 text-white', \`#\${index + 1}\`));

                        if (scene.isNativeHQ) header.appendChild(el('span', 'text-xs bg-orange-900/40 text-orange-300 px-2 py-0.5 rounded border border-orange-500/50 font-bold', '🚀 Native HQ'));
                        if (scene.isInfographic) header.appendChild(el('span', 'text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded border border-blue-500/50 font-bold', '📊 Info'));
                        if (scene.isLoopMode) header.appendChild(el('span', 'text-xs bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded border border-teal-500/50 font-bold', '🔄 Loop'));

                        if(scene.videoUrl || scene.videoModelUsed) {
                            const vModel = scene.videoModelUsed;
                            let badgeClass = 'bg-gray-700 text-gray-300 border-gray-600';
                            let badgeText = 'VIDEO';

                            if (vModel === 'veo-3.1-apimart' || vModel === 'veo-3.1-quality') {
                                badgeClass = 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-violet-400/50';
                                badgeText = '💎 Veo 1080p';
                            } else if (vModel === 'veo-3.1-fast') {
                                badgeClass = 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-blue-400/50';
                                badgeText = '⚡ Veo 720p';
                            } else if (vModel === 'grok') {
                                if (scene.isNativeHQ) {
                                    badgeClass = 'bg-gradient-to-r from-amber-500 to-orange-500 text-white';
                                    badgeText = '🚀 Grok 720p';
                                } else {
                                    badgeClass = 'bg-pink-900/80 text-pink-200 border-pink-700';
                                    badgeText = '🚀 Grok';
                                }
                            }
                            header.appendChild(el('span', \`text-xs px-2 py-0.5 rounded border font-bold \${badgeClass}\`, badgeText));
                        }
                        card.appendChild(header);

                        const imgContainer = el('div', \`relative \${aspectClass} bg-black cursor-zoom-in group/img overflow-hidden\`);
                        imgContainer.onclick = () => openLightbox(index);

                        if (scene.imageUrl) {
                            const img = el('img', 'w-full h-full object-contain', '', { src: scene.imageUrl, loading: 'lazy' });
                            imgContainer.appendChild(img);
                            const overlay = el('div', 'absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none');
                            overlay.appendChild(el('span', 'text-white text-3xl font-bold drop-shadow-md', '🔍'));
                            imgContainer.appendChild(overlay);
                        } else {
                            imgContainer.appendChild(el('div', 'flex items-center justify-center h-full text-gray-600 text-sm', 'No Image'));
                        }

                        // 자막 오버레이
                        if (projectData._subtitleStyle && projectData._subtitles && projectData._subtitles.length > 0) {
                            const sub = projectData._subtitles.find(s => s.index === index);
                            if (sub && sub.text) {
                                const st = projectData._subtitleStyle;
                                const subEl = el('div', 'absolute left-0 right-0 text-center px-4 pointer-events-none', sub.text);
                                subEl.style.bottom = (st.positionY || 10) + '%';
                                subEl.style.fontFamily = "'" + st.fontFamily + "', sans-serif";
                                subEl.style.fontSize = Math.max(12, Math.round((st.fontSize || 48) * 0.4)) + 'px';
                                subEl.style.fontWeight = st.fontWeight || 700;
                                subEl.style.fontStyle = st.fontStyle || 'normal';
                                subEl.style.color = st.color || '#FFFFFF';
                                subEl.style.letterSpacing = (st.letterSpacing || 0) + 'px';
                                subEl.style.lineHeight = String(st.lineHeight || 1.4);
                                subEl.style.textAlign = st.textAlign || 'center';
                                if (st.textShadowCSS) {
                                    subEl.style.textShadow = st.textShadowCSS;
                                } else if (st.shadowColor) {
                                    subEl.style.textShadow = (st.shadowOffsetX||0)+'px '+(st.shadowOffsetY||2)+'px '+(st.shadowBlur||4)+'px '+st.shadowColor;
                                }
                                if (st.outlineColor && st.outlineWidth > 0) {
                                    subEl.style.webkitTextStroke = st.outlineWidth + 'px ' + st.outlineColor;
                                }
                                if (st.backgroundColor) {
                                    subEl.style.backgroundColor = st.backgroundColor;
                                    subEl.style.padding = '4px 12px';
                                    subEl.style.borderRadius = '4px';
                                    subEl.style.display = 'inline-block';
                                    subEl.style.width = 'auto';
                                    subEl.style.marginLeft = 'auto';
                                    subEl.style.marginRight = 'auto';
                                }
                                imgContainer.appendChild(subEl);
                            }
                        }

                        card.appendChild(imgContainer);

                        const scriptBox = el('div', 'p-4 flex-grow bg-gray-800/50');
                        scriptBox.appendChild(el('p', 'text-sm text-gray-300 leading-relaxed font-medium whitespace-pre-wrap', getSceneNarrationText(scene)));
                        card.appendChild(scriptBox);
                        container.appendChild(card);
                    });
                }
                // ... (rest of scripts unchanged) ...
                function openCharacter() {
                    const config = projectData.config;
                    const charImg = config.characterPublicUrl || config.characterImage;
                    if(!charImg) { showToast("설정된 캐릭터 이미지가 없습니다."); return; }
                    document.getElementById('char-img').src = charImg;
                    document.getElementById('char-modal').classList.remove('hidden');
                }
                function closeCharacter() { document.getElementById('char-modal').classList.add('hidden'); }

                function openTextModal(mode) {
                    const modal = document.getElementById('text-modal');
                    const titleEl = document.getElementById('text-modal-title');
                    const textarea = document.getElementById('text-modal-area');
                    let content = "";
                    let title = "";
                    if (mode === 'SCRIPT') { title = "📜 전체 대본"; content = projectData.scenes.map(s => getSceneNarrationText(s)).filter(Boolean).join('\\n\\n'); }
                    else if (mode === 'VISUAL') { title = "🎨 비주얼 프롬프트"; content = projectData.scenes.map((s, i) => \`=== Scene \${i+1} ===\\n\${s.visualPrompt || "No prompt"}\`).join('\\n\\n'); }
                    else if (mode === 'VIDEO') { title = "🎬 영상 프롬프트"; content = projectData.scenes.map((s, i) => { let p = (s.visualPrompt || "").trim(); let tags = ""; if(s.cameraAngle) tags += " [CAMERA: "+s.cameraAngle+"]"; if(s.cameraMovement) tags += " [MOVEMENT: "+s.cameraMovement+"]"; return \`=== Scene \${i+1} ===\\n\${p}\${tags}\`; }).join('\\n\\n'); }
                    titleEl.innerText = title; textarea.value = content; modal.classList.remove('hidden');
                }
                function closeTextModal() { document.getElementById('text-modal').classList.add('hidden'); }
                function copyTextModal() { navigator.clipboard.writeText(document.getElementById('text-modal-area').value).then(() => showToast('✅ 복사되었습니다!')); }

                async function downloadAllImages() {
                    if (!window.JSZip) { showToast('JSZip library not loaded.'); return; }
                    showToast('📦 이미지 압축 중...');
                    const zip = new JSZip();
                    let count = 0;
                    projectData.scenes.forEach((scene, idx) => {
                        if (scene.imageUrl && scene.imageUrl.startsWith('data:image')) {
                            zip.file(\`scene_\${String(idx+1).padStart(2,'0')}.png\`, scene.imageUrl.split(',')[1], {base64: true});
                            count++;
                        }
                    });
                    if(count === 0) { showToast("다운로드할 이미지가 없습니다."); return; }
                    const blob = await zip.generateAsync({type:"blob"});
                    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = \`\${projectData.title.substring(0,10)}_images.zip\`; link.click(); showToast('✅ 다운로드 시작!');
                }
                function downloadSingleImage(url, name) { const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); document.body.removeChild(link); }
                function openLightbox(index) {
                    const scene = projectData.scenes[index];
                    if(!scene || !scene.imageUrl) return;
                    document.getElementById('lightbox-img').src = scene.imageUrl;
                    document.getElementById('lightbox-dl-btn').onclick = (e) => { e.stopPropagation(); downloadSingleImage(scene.imageUrl, \`scene_\${index+1}.png\`); };
                    document.getElementById('lightbox-modal').classList.remove('hidden');
                }
                function closeLightbox() { document.getElementById('lightbox-modal').classList.add('hidden'); }
                document.addEventListener('DOMContentLoaded', render);
                document.addEventListener('keydown', (e) => { if(e.key === 'Escape') { closeCharacter(); closeLightbox(); closeTextModal(); } });
            </script>
          `;

    const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${displayTitle} - Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
    ${subtitleFontCss || ''}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>body { background-color: #111827; color: white; font-family: 'Pretendard', sans-serif; } ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #1f2937; } ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; } .aspect-video { aspect-ratio: 16/9; } .aspect-square { aspect-ratio: 1/1; } .aspect-[9/16] { aspect-ratio: 9/16; } .aspect-[4/3] { aspect-ratio: 4/3; } .modal-bg { background-color: rgba(0,0,0,0.95); }</style>
    <script id="project-data">const projectData = ${JSON.stringify({
        ...data,
        _subtitleStyle: subtitleStyle?.template || null,
        _subtitles: subtitles || [],
    }).replace(/<\//g, '<\\/')};</script>
    ${scriptBody}
</head>
<body class="min-h-screen flex flex-col">
    <div id="toast" class="fixed top-6 left-1/2 transform -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl z-[100] transition-all duration-300 translate-y-20 opacity-0 font-bold flex items-center gap-2 border border-emerald-400">✅ 알림 메시지</div>
    <header class="sticky top-0 bg-gray-900/90 backdrop-blur-md border-b border-gray-800 z-40">
        <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="flex-1 min-w-0"><h1 class="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 truncate">${displayTitle}</h1></div>
            <div class="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                <button onclick="openCharacter()" class="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-xs font-bold text-gray-300">👤 캐릭터</button>
                <button onclick="openTextModal('SCRIPT')" class="px-3 py-2 bg-blue-900/30 hover:bg-blue-800/50 border border-blue-500/50 rounded-lg text-xs font-bold text-blue-200">📜 대본</button>
                <button onclick="openTextModal('VISUAL')" class="px-3 py-2 bg-purple-900/30 hover:bg-purple-800/50 border border-purple-500/50 rounded-lg text-xs font-bold text-purple-200">🎨 이미지 프롬프트</button>
                <button onclick="openTextModal('VIDEO')" class="px-3 py-2 bg-pink-900/30 hover:bg-pink-800/50 border border-pink-500/50 rounded-lg text-xs font-bold text-pink-200">🎬 영상 프롬프트</button>
                <button onclick="downloadAllImages()" class="px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg">💾 이미지 저장</button>
            </div>
        </div>
    </header>
    <main class="flex-grow p-4 md:p-8 max-w-7xl mx-auto w-full">
        <!-- Badge Section -->
        <div id="project-info-badges" class="flex flex-wrap gap-2 mb-6 pb-4 border-b border-gray-800"></div>

        <!-- Thumbnails Section -->
        <div class="mb-10">
            <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
                <span class="text-2xl">🖼️</span> 썸네일 (Thumbnails)
            </h2>
            <div id="thumbnail-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"></div>
        </div>

        <!-- Storyboard Section -->
        <div>
            <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
                <span class="text-2xl">🎬</span> 스토리보드 (Storyboard)
            </h2>
            <div id="scene-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        </div>
    </main>
    <footer class="py-8 text-center text-gray-600 text-xs border-t border-gray-800 mt-auto bg-gray-900">Generated by AI All-in-One Production</footer>
    <div id="char-modal" class="fixed inset-0 z-[60] modal-bg hidden flex items-center justify-center p-4" onclick="closeCharacter()"><div class="relative max-w-2xl w-full bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl overflow-hidden" onclick="event.stopPropagation()"><div class="p-4 bg-white flex justify-center"><img id="char-img" class="max-h-[60vh] object-contain" src="" /></div><div class="p-4 bg-gray-900 border-t border-gray-700 flex justify-end"><button onclick="downloadSingleImage(document.getElementById('char-img').src, 'character_ref.png')" class="px-4 py-2 bg-white text-black font-bold rounded-lg text-sm">다운로드</button></div></div></div>
    <div id="text-modal" class="fixed inset-0 z-[80] modal-bg hidden flex items-center justify-center p-4" onclick="closeTextModal()"><div class="bg-gray-800 rounded-xl border border-gray-600 shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]" onclick="event.stopPropagation()"><div class="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl"><h3 id="text-modal-title" class="font-bold text-white text-lg"></h3><button onclick="closeTextModal()" class="text-gray-400">✕</button></div><textarea id="text-modal-area" class="w-full h-[60vh] bg-gray-950 text-gray-300 p-4 font-mono text-sm resize-none outline-none custom-scrollbar" readonly></textarea><div class="p-4 border-t border-gray-700 bg-gray-900 rounded-b-xl flex justify-end gap-2"><button onclick="closeTextModal()" class="px-4 py-2 bg-gray-700 rounded font-bold">닫기</button><button onclick="copyTextModal()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">복사</button></div></div></div>
    <div id="lightbox-modal" class="fixed inset-0 z-[70] modal-bg hidden flex items-center justify-center p-4" onclick="closeLightbox()"><button onclick="closeLightbox()" class="absolute top-4 right-4 text-gray-400 p-2 z-[80]">✕</button><img id="lightbox-img" class="max-w-[95vw] max-h-[85vh] object-contain rounded shadow-2xl" onclick="event.stopPropagation()" /><div class="absolute bottom-8 left-1/2 transform -translate-x-1/2"><button id="lightbox-dl-btn" class="bg-white text-black px-6 py-2 rounded-full font-bold shadow-lg">다운로드</button></div></div>
</body></html>`;

    return htmlContent;
};
