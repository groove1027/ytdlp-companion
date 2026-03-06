// ZIP 내보내기용 최적화 HTML 뷰어 템플릿
// IntersectionObserver 레이지 로딩 + 20장면 페이지네이션

export function buildOptimizedViewerHtml(projectTitle: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(projectTitle)} — Storyboard Viewer</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
<style>
body{font-family:'Pretendard',sans-serif;background:#111827;color:#e5e7eb;margin:0}
.lazy-img{opacity:0;transition:opacity .3s}.lazy-img.loaded{opacity:1}
.page-btn{padding:6px 14px;border-radius:8px;font-size:13px;font-weight:700;border:1px solid #374151;background:#1f2937;color:#9ca3af;cursor:pointer;transition:all .15s}
.page-btn:hover{border-color:#6b7280;color:#e5e7eb}
.page-btn.active{background:#2563eb;border-color:#3b82f6;color:#fff}
</style>
</head>
<body>
<div id="app" style="max-width:1200px;margin:0 auto;padding:24px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
    <h1 style="font-size:24px;font-weight:800;color:#fff" id="title"></h1>
    <div style="display:flex;gap:8px">
      <button onclick="downloadAllImages()" class="page-btn" style="background:#1e3a2f;border-color:#065f46;color:#34d399">이미지 전체 다운로드</button>
    </div>
  </div>
  <div id="badges" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px"></div>
  <div id="pagination-top" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px"></div>
  <div id="scene-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px"></div>
  <div id="pagination-bottom" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:16px;justify-content:center"></div>
</div>

<div id="lightbox" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:pointer" onclick="this.style.display='none'">
  <img id="lb-img" style="max-width:90vw;max-height:90vh;border-radius:12px">
</div>

<script id="project-data" type="application/json"><\/script>
<script>
const SCENES_PER_PAGE=20;
let manifest=null,currentPage=0,totalPages=0;

async function init(){
  try{
    const r=await fetch('data/manifest.json');
    manifest=await r.json();
  }catch(e){
    const el=document.getElementById('project-data');
    if(el&&el.textContent.trim())manifest=JSON.parse(el.textContent);
  }
  if(!manifest){document.getElementById('app').innerHTML='<p style="color:#ef4444;text-align:center;padding:40px">manifest.json을 찾을 수 없습니다.</p>';return}
  document.getElementById('title').textContent=manifest.title||'Storyboard';
  document.title=manifest.title+' — Storyboard Viewer';
  renderBadges();
  totalPages=Math.ceil(manifest.scenes.length/SCENES_PER_PAGE);
  renderPage(0);
}

function renderBadges(){
  const c=manifest.config||{};
  const badges=[];
  if(c.mode)badges.push({t:c.mode,color:'#3b82f6'});
  if(c.aspectRatio)badges.push({t:c.aspectRatio,color:'#8b5cf6'});
  if(c.atmosphere)badges.push({t:c.atmosphere,color:'#f59e0b'});
  const el=document.getElementById('badges');
  el.innerHTML=badges.map(b=>'<span style="display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:'+b.color+'20;color:'+b.color+';border:1px solid '+b.color+'40">'+b.t+'</span>').join('');
}

function renderPage(page){
  currentPage=page;
  const start=page*SCENES_PER_PAGE;
  const pageScenes=manifest.scenes.slice(start,start+SCENES_PER_PAGE);
  const grid=document.getElementById('scene-grid');
  grid.innerHTML=pageScenes.map((s,i)=>{
    const idx=start+i;
    const imgSrc=s.imageFile?'data/scenes/'+s.imageFile:'';
    return '<div style="background:#1f2937;border:1px solid #374151;border-radius:12px;overflow:hidden">'
      +'<div style="position:relative;aspect-ratio:16/9;background:#111827;cursor:pointer" onclick="openLB(\\''+imgSrc+'\\')">'
      +(imgSrc?'<img data-src="'+imgSrc+'" class="lazy-img" style="width:100%;height:100%;object-fit:cover" alt="Scene '+(idx+1)+'">':'<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b7280;font-size:13px">이미지 없음</div>')
      +'</div>'
      +'<div style="padding:10px">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:12px;font-weight:700;color:#d1d5db">#'+(idx+1)+'</span>'
      +(s.characterPresent?'<span style="width:6px;height:6px;border-radius:50%;background:#a78bfa"></span>':'')
      +(s.videoUrl?'<span style="width:6px;height:6px;border-radius:50%;background:#34d399"></span>':'')
      +'</div>'
      +'<p style="font-size:11px;color:#9ca3af;line-height:1.4;max-height:80px;overflow-y:auto">'+(s.scriptText||'(나레이션 없음)')+'</p>'
      +'</div></div>';
  }).join('');
  // Pagination
  renderPagination('pagination-top');
  renderPagination('pagination-bottom');
  // Lazy load
  observeImages();
}

function renderPagination(containerId){
  if(totalPages<=1){document.getElementById(containerId).innerHTML='';return}
  const el=document.getElementById(containerId);
  let html='';
  for(let i=0;i<totalPages;i++){
    const label=(i*SCENES_PER_PAGE+1)+'-'+Math.min((i+1)*SCENES_PER_PAGE,manifest.scenes.length);
    html+='<button class="page-btn'+(i===currentPage?' active':'')+'" onclick="renderPage('+i+')">'+label+'</button>';
  }
  el.innerHTML=html;
}

function observeImages(){
  const imgs=document.querySelectorAll('.lazy-img:not(.loaded)');
  if(!imgs.length)return;
  const obs=new IntersectionObserver((entries,o)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const img=e.target;
        img.src=img.dataset.src;
        img.onload=()=>img.classList.add('loaded');
        o.unobserve(img);
      }
    });
  },{rootMargin:'200px'});
  imgs.forEach(img=>obs.observe(img));
}

function openLB(src){
  if(!src)return;
  document.getElementById('lb-img').src=src;
  document.getElementById('lightbox').style.display='flex';
}

async function downloadAllImages(){
  const script=document.createElement('script');
  script.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  document.head.appendChild(script);
  await new Promise(r=>script.onload=r);
  const zip=new JSZip();
  for(const s of manifest.scenes){
    if(!s.imageFile)continue;
    try{
      const resp=await fetch('data/scenes/'+s.imageFile);
      const blob=await resp.blob();
      zip.file(s.imageFile,blob);
    }catch(e){console.warn('Skip',s.imageFile,e)}
  }
  const blob=await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(manifest.title||'images')+'.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}

init();
<\/script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
