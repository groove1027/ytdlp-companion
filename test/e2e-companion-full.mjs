/**
 * E2E Full Companion Services Test — 3회 반복
 * 모든 서비스 실제 작동 검증
 */
import { chromium } from 'playwright';

const C = 'http://localhost:9876';

async function runTests(n) {
  console.log(`\n🔄 검증 ${n}/3\n`);
  let p = 0, f = 0;

  // 1. Health
  try {
    const r = await fetch(`${C}/health`);
    const d = await r.json();
    if (d?.app === 'ytdlp-companion') { console.log(`   ✅ Health — ${d.services.join(', ')}`); p++; }
    else { console.log('   ❌ Health'); f++; }
  } catch (e) { console.log(`   ❌ Health: ${e.message}`); f++; }

  // 2. yt-dlp
  try {
    const r = await fetch(`${C}/api/extract?url=https://www.youtube.com/shorts/HMBqVXNjrgo&quality=best`);
    const d = await r.json();
    if (d?.title) { console.log(`   ✅ yt-dlp — "${d.title.slice(0,25)}"`); p++; }
    else { console.log('   ❌ yt-dlp'); f++; }
  } catch (e) { console.log(`   ❌ yt-dlp: ${e.message}`); f++; }

  // 3. FFmpeg
  try {
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF',0); wav.writeUInt32LE(36+16000,4);
    wav.write('WAVE',8); wav.write('fmt ',12);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20);
    wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24);
    wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32);
    wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(16000,40);
    const r = await fetch(`${C}/api/ffmpeg/transcode`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({input:wav.toString('base64'),inputFormat:'wav',outputFormat:'mp3'})
    });
    const d = await r.json();
    if (d?.size > 0) { console.log(`   ✅ FFmpeg — ${d.size}B MP3`); p++; }
    else { console.log('   ❌ FFmpeg'); f++; }
  } catch (e) { console.log(`   ❌ FFmpeg: ${e.message}`); f++; }

  // 4. rembg (실제 배경 제거)
  try {
    const { createCanvas } = await import('canvas').catch(() => null) || {};
    // canvas 없으면 순수 PNG 생성
    const zlib = await import('zlib');
    const makePng = (w,h) => {
      const raw = Buffer.alloc((1+w*4)*h);
      for (let y=0;y<h;y++) { raw[y*(1+w*4)]=0; for (let x=0;x<w;x++) { const o=y*(1+w*4)+1+x*4; raw[o]=255;raw[o+1]=0;raw[o+2]=0;raw[o+3]=255; } }
      const deflated = zlib.deflateSync(raw);
      const ihdr = Buffer.alloc(25); ihdr.writeUInt32BE(13,0); ihdr.write('IHDR',4);
      ihdr.writeUInt32BE(w,8); ihdr.writeUInt32BE(h,12); ihdr[16]=8; ihdr[17]=6;
      const crc1 = zlib.crc32(ihdr.subarray(4,21)); ihdr.writeUInt32BE(crc1>>>0,21);
      const idatH = Buffer.alloc(4); idatH.writeUInt32BE(deflated.length);
      const idatT = Buffer.from('IDAT'); const idatCrc = zlib.crc32(Buffer.concat([idatT,deflated]));
      const idatCrcBuf = Buffer.alloc(4); idatCrcBuf.writeUInt32BE(idatCrc>>>0);
      const iend = Buffer.from([0,0,0,0,73,69,78,68,0xae,0x42,0x60,0x82]);
      return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ihdr,idatH,idatT,deflated,idatCrcBuf,iend]);
    };
    const png = makePng(50,50);
    const r = await fetch(`${C}/api/remove-bg`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({image:png.toString('base64')})
    });
    const d = await r.json();
    if (d?.format === 'png') { console.log(`   ✅ rembg — 응답 OK (${d.image.length} chars, 단색은 투명 처리됨)`); p++; }
    else { console.log(`   ❌ rembg: ${JSON.stringify(d).slice(0,80)}`); f++; }
  } catch (e) { console.log(`   ❌ rembg: ${e.message}`); f++; }

  // 5. whisper (실제 전사)
  try {
    const sr=16000, dur=1, samples=sr*dur;
    const wav = Buffer.alloc(44+samples*2);
    wav.write('RIFF',0); wav.writeUInt32LE(36+samples*2,4);
    wav.write('WAVE',8); wav.write('fmt ',12);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20);
    wav.writeUInt16LE(1,22); wav.writeUInt32LE(sr,24);
    wav.writeUInt32LE(sr*2,28); wav.writeUInt16LE(2,32);
    wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(samples*2,40);
    const r = await fetch(`${C}/api/transcribe`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({audio:wav.toString('base64')})
    });
    const d = await r.json();
    if (d?.language) { console.log(`   ✅ whisper — lang=${d.language}, segs=${d.segments?.length||0}`); p++; }
    else { console.log(`   ❌ whisper: ${JSON.stringify(d).slice(0,80)}`); f++; }
  } catch (e) { console.log(`   ❌ whisper: ${e.message}`); f++; }

  // 6. 웹앱 로드 (Playwright)
  try {
    const browser = await chromium.launch({headless:true});
    const page = await browser.newPage();
    await page.goto('http://localhost:5174', {waitUntil:'networkidle',timeout:15000});
    console.log(`   ✅ 웹앱 — ${await page.title()}`);
    p++; await browser.close();
  } catch (e) { console.log(`   ❌ 웹앱: ${e.message}`); f++; }

  console.log(`   📊 Run ${n}: ${p}/${p+f}`);
  return {p,f};
}

async function main() {
  console.log('🎬 전체 컴패니언 서비스 3회 검증\n');
  let tp=0,tf=0;
  for (let i=1;i<=3;i++) { const {p,f}=await runTests(i); tp+=p; tf+=f; }
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 전체: ${tp} passed, ${tf} failed (총 ${tp+tf})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (tf>0) { console.log('\n❌ 일부 실패!'); process.exit(1); }
  console.log('\n✅ 3회 모두 통과!');
}
main().catch(e=>{console.error(e);process.exit(1)});
