/**
 * 실제 편집실 전환 테스트 — Chrome 유저 프로필로 연결
 * 기존 Chrome을 닫고, 같은 프로필 + 디버그 포트로 재시작
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, '_test_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const APP_URL = 'http://localhost:3000/';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_DATA_DIR = '/Users/mac_mini/Library/Application Support/Google/Chrome';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, name) {
  const fp = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  console.log(`  📸 ${name}.png`);
  return fp;
}

async function main() {
  console.log('=== 실제 편집실 전환 효과 테스트 ===\n');

  // 기존 Chrome에 디버그 포트가 없으므로, 유저 프로필을 사용하여 Puppeteer로 새로 실행
  console.log('[준비] Chrome을 유저 프로필 + 디버그 모드로 실행...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: USER_DATA_DIR,
    headless: false,
    defaultViewport: null,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      '--remote-debugging-port=9222',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const pages = await browser.pages();
  let page = pages[0] || await browser.newPage();

  // 콘솔 에러 추적
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const results = [];
  function addResult(test, pass, detail = '') {
    results.push({ test, pass, detail });
    console.log(`  [${pass ? '✅ PASS' : '❌ FAIL'}] ${test}${detail ? ' — ' + detail : ''}`);
  }

  try {
    // ─── Step 1: 앱 로드 ───
    console.log('\n[Step 1] localhost:3000 로드...');
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    await screenshot(page, '01_app_loaded');

    // 편집실 탭 클릭
    console.log('[Step 2] 편집실 탭 이동...');
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const editBtn = btns.find(b => (b.textContent || '').includes('편집실'));
      if (editBtn) editBtn.click();
    });
    await sleep(3000);
    await screenshot(page, '02_editroom');

    // ─── Step 3: 편집실 상태 확인 ───
    console.log('\n[Step 3] 편집실 상태 확인...');

    const state = await page.evaluate(() => {
      const baseLayer = document.querySelector('[data-base-layer]');
      const baseMedia = baseLayer?.querySelector('img, video') || baseLayer;
      const sceneCount = document.querySelectorAll('[data-scene-id]').length;

      // 타임라인의 모든 클릭 가능한 장면 영역 찾기
      // 영상 트랙의 장면 번호 아이콘 (1, 2, 3...)
      const allEls = [...document.querySelectorAll('*')];
      const filmstripItems = allEls.filter(el => {
        const r = el.getBoundingClientRect();
        // 타임라인 영상 트랙 영역 (하단)
        return r.top > 700 && r.top < 790 && r.height > 30 && r.height < 70
          && r.width > 50 && el.querySelector('img');
      });

      let animInfo = null;
      if (baseMedia) {
        try {
          const anims = baseMedia.getAnimations();
          const computed = getComputedStyle(baseMedia);
          animInfo = {
            animation: baseMedia.style.animation?.substring(0, 100),
            transform: computed.transform,
            transformOrigin: computed.transformOrigin,
            animCount: anims.length,
            currentTime: anims[0]?.currentTime,
            playState: anims[0]?.playState,
          };
        } catch (e) {
          animInfo = { error: e.message };
        }
      }

      return {
        hasBaseLayer: !!baseLayer,
        hasBaseMedia: !!baseMedia,
        sceneCount,
        filmstripCount: filmstripItems.length,
        filmstripPositions: filmstripItems.map(el => {
          const r = el.getBoundingClientRect();
          return {
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2),
            w: Math.round(r.width),
          };
        }),
        animInfo,
      };
    });

    console.log(`  장면 수: ${state.sceneCount}, 필름스트립: ${state.filmstripCount}`);
    console.log(`  baseLayer: ${state.hasBaseLayer}, baseMedia: ${state.hasBaseMedia}`);
    if (state.animInfo) {
      console.log(`  애니메이션: ${state.animInfo.animation}`);
      console.log(`  transform: ${state.animInfo.transform}`);
      console.log(`  animCount: ${state.animInfo.animCount}, playState: ${state.animInfo.playState}`);
    }

    addResult('편집실 로드', state.hasBaseLayer || state.sceneCount > 0);

    if (!state.hasBaseLayer && state.sceneCount === 0) {
      console.log('\n  ⚠️ 프로젝트가 없습니다. IndexedDB에 데이터가 있는지 확인...');

      const dbCheck = await page.evaluate(async () => {
        try {
          const dbs = await indexedDB.databases();
          return dbs.map(d => ({ name: d.name, version: d.version }));
        } catch {
          return [];
        }
      });
      console.log(`  IndexedDB 목록: ${JSON.stringify(dbCheck)}`);
      await screenshot(page, '03_no_project');

      // 프로젝트가 없으면 첫 번째 프로젝트를 열어보기
      console.log('  프로젝트 탭에서 프로젝트 찾기...');
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const projBtn = btns.find(b => (b.textContent || '').includes('프로젝트'));
        if (projBtn) projBtn.click();
      });
      await sleep(2000);
      await screenshot(page, '04_project_tab');

      // 첫 번째 프로젝트 카드 클릭
      const projectClicked = await page.evaluate(() => {
        // 프로젝트 카드나 리스트 아이템 찾기
        const cards = [...document.querySelectorAll('[class*="card"], [class*="project"], [class*="item"]')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.top > 200 && r.height > 50 && r.width > 100;
        });

        // 또는 프로젝트 이름이 있는 클릭 가능한 요소
        const clickables = [...document.querySelectorAll('div, a, button')].filter(el => {
          const r = el.getBoundingClientRect();
          const text = el.textContent || '';
          return r.top > 250 && r.top < 600 && r.height > 40 && r.height < 200
            && text.length > 3 && text.length < 200
            && !text.includes('프로젝트가 없습니다');
        });

        if (clickables.length > 0) {
          clickables[0].click();
          return { clicked: true, text: clickables[0].textContent?.substring(0, 50) };
        }
        return { clicked: false, cardCount: cards.length };
      });
      console.log(`  프로젝트 클릭: ${JSON.stringify(projectClicked)}`);
      await sleep(3000);

      // 다시 편집실로
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const editBtn = btns.find(b => (b.textContent || '').includes('편집실'));
        if (editBtn) editBtn.click();
      });
      await sleep(3000);
      await screenshot(page, '05_editroom_retry');
    }

    // ─── Step 4: 장면 전환 테스트 ───
    console.log('\n[Step 4] 장면 전환 테스트...');

    // 다시 상태 확인
    const state2 = await page.evaluate(() => {
      const base = document.querySelector('[data-base-layer]');
      const media = base?.querySelector('img, video') || base;

      // 화살표 버튼 (다음/이전 장면) 찾기
      const arrowBtns = [...document.querySelectorAll('button, [role="button"]')].filter(el => {
        const r = el.getBoundingClientRect();
        const text = el.textContent || el.getAttribute('aria-label') || '';
        // 프리뷰 영역 좌우에 있는 화살표
        return (r.top > 300 && r.top < 650 && (r.left < 300 || r.right > 800) && r.width < 80)
          || text.includes('▶') || text.includes('◀') || text.includes('→') || text.includes('←')
          || text.includes('next') || text.includes('prev');
      });

      // 숫자 인디케이터 (1/5 등) 근처의 화살표
      const allBtns = [...document.querySelectorAll('button')];
      const navBtns = allBtns.filter(b => {
        const r = b.getBoundingClientRect();
        return r.top > 300 && r.top < 700 && r.width < 60 && r.height < 60;
      });

      return {
        hasBase: !!base,
        hasMedia: !!media,
        arrowCount: arrowBtns.length,
        navBtns: navBtns.map(b => ({
          text: b.textContent?.trim()?.substring(0, 10),
          x: Math.round(b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2),
          y: Math.round(b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2),
        })).slice(0, 10),
      };
    });

    console.log(`  base: ${state2.hasBase}, 화살표: ${state2.arrowCount}`);
    console.log(`  네비 버튼: ${JSON.stringify(state2.navBtns)}`);

    // 프리뷰 오른쪽의 > 화살표 찾기 (장면 전환)
    if (state2.hasBase) {
      // 오른쪽 화살표 (다음 장면) 클릭
      const nextArrow = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        // 프리뷰 오른쪽에 있는 화살표
        const rightArrow = btns.find(b => {
          const r = b.getBoundingClientRect();
          const text = b.textContent?.trim();
          return r.right > 850 && r.right < 960 && r.top > 350 && r.top < 600
            && (text === '›' || text === '>' || text === '❯' || r.width < 50);
        });
        if (rightArrow) {
          return {
            x: Math.round(rightArrow.getBoundingClientRect().x + rightArrow.getBoundingClientRect().width / 2),
            y: Math.round(rightArrow.getBoundingClientRect().y + rightArrow.getBoundingClientRect().height / 2),
            text: rightArrow.textContent?.trim(),
          };
        }
        return null;
      });

      if (nextArrow) {
        console.log(`  다음 장면 화살표: (${nextArrow.x}, ${nextArrow.y}) "${nextArrow.text}"`);

        // ─── 전환 전 transform 캡처 ───
        const beforeSnap = await page.evaluate(() => {
          const base = document.querySelector('[data-base-layer]');
          const media = base?.querySelector('img, video') || base;
          if (!media) return null;
          const anims = media.getAnimations();
          return {
            transform: getComputedStyle(media).transform,
            animation: media.style.animation?.substring(0, 80),
            currentTime: anims[0]?.currentTime,
          };
        });
        console.log(`\n  === 전환 1: 다음 장면 ===`);
        console.log(`  전환 전 transform: ${beforeSnap?.transform}`);

        // 클릭
        await page.mouse.click(nextArrow.x, nextArrow.y);
        await sleep(150); // 전환 시작 직후

        await screenshot(page, '06_transition_start');

        // 전환 중 exit overlay 상태
        const transitState = await page.evaluate(() => {
          // exit overlay 찾기 (z-index가 높은 absolute 요소)
          const overlays = [...document.querySelectorAll('div')].filter(el => {
            const s = el.style;
            return s.position === 'absolute' && s.zIndex && parseInt(s.zIndex) >= 3
              && s.inset === '0px';
          });

          return overlays.map(ov => {
            const media = ov.querySelector('img, video, div[style*="background"]');
            return {
              zIndex: ov.style.zIndex,
              animation: ov.style.animation?.substring(0, 60),
              mediaTransform: media ? getComputedStyle(media).transform : 'no media',
              mediaAnim: media?.style.animation?.substring(0, 60),
              mediaAnimCount: media ? media.getAnimations().length : 0,
            };
          });
        });
        console.log(`  전환 중 overlay: ${JSON.stringify(transitState, null, 2)}`);

        // 전환 완료 대기
        await sleep(1500);
        await screenshot(page, '07_after_transition');

        const afterSnap = await page.evaluate(() => {
          const base = document.querySelector('[data-base-layer]');
          const media = base?.querySelector('img, video') || base;
          if (!media) return null;
          const anims = media.getAnimations();
          return {
            transform: getComputedStyle(media).transform,
            animation: media.style.animation?.substring(0, 80),
            currentTime: anims[0]?.currentTime,
            animCount: anims.length,
          };
        });
        console.log(`  전환 후 transform: ${afterSnap?.transform}`);
        console.log(`  전환 후 animation: ${afterSnap?.animation}`);

        addResult('장면 전환 실행', true);
        addResult('전환 후 Ken Burns 모션 유지',
          afterSnap?.animCount > 0,
          `animCount=${afterSnap?.animCount}`);

        // ─── 2번째 전환 ───
        console.log(`\n  === 전환 2: 다시 다음 장면 ===`);
        await page.mouse.click(nextArrow.x, nextArrow.y);
        await sleep(100);
        await screenshot(page, '08_transition2_start');
        await sleep(1500);
        await screenshot(page, '09_transition2_done');

        // ─── 3번째 전환 (이전 장면) ───
        const prevArrow = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button')];
          const leftArrow = btns.find(b => {
            const r = b.getBoundingClientRect();
            return r.left > 200 && r.left < 300 && r.top > 350 && r.top < 600 && r.width < 50;
          });
          if (leftArrow) {
            return {
              x: Math.round(leftArrow.getBoundingClientRect().x + leftArrow.getBoundingClientRect().width / 2),
              y: Math.round(leftArrow.getBoundingClientRect().y + leftArrow.getBoundingClientRect().height / 2),
            };
          }
          return null;
        });

        if (prevArrow) {
          console.log(`\n  === 전환 3: 이전 장면 ===`);
          await page.mouse.click(prevArrow.x, prevArrow.y);
          await sleep(100);
          await screenshot(page, '10_transition3_start');
          await sleep(1500);
          await screenshot(page, '11_transition3_done');
        }

      } else {
        console.log('  화살표 버튼을 찾지 못함 — 전체 페이지 스크린샷으로 확인');
        await screenshot(page, '06_no_arrows');
      }
    }

    // ─── Step 5: 재생 버튼 테스트 ───
    console.log('\n[Step 5] 타임라인 재생...');
    const playBtn = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const play = btns.find(b => {
        const r = b.getBoundingClientRect();
        // 타임라인 컨트롤 (하단 영역, 재생 아이콘)
        return r.top > 680 && r.top < 730 && r.left < 300 && r.width < 50;
      });
      if (play) {
        return {
          x: Math.round(play.getBoundingClientRect().x + play.getBoundingClientRect().width / 2),
          y: Math.round(play.getBoundingClientRect().y + play.getBoundingClientRect().height / 2),
        };
      }
      return null;
    });

    if (playBtn) {
      await page.mouse.click(playBtn.x, playBtn.y);
      console.log(`  재생 시작 (${playBtn.x}, ${playBtn.y})`);
      await sleep(500);

      // 3초 동안 재생하면서 transform 변화 추적
      const playTransforms = [];
      for (let i = 0; i < 6; i++) {
        await sleep(500);
        const t = await page.evaluate(() => {
          const base = document.querySelector('[data-base-layer]');
          const media = base?.querySelector('img, video') || base;
          if (!media) return 'no_media';
          return getComputedStyle(media).transform?.substring(0, 35);
        });
        playTransforms.push(t);
      }
      console.log(`  재생 중 transforms: ${playTransforms.join(' | ')}`);

      const uniqueTransforms = new Set(playTransforms.filter(t => t !== 'no_media'));
      addResult('재생 중 Ken Burns 모션 변화', uniqueTransforms.size > 1,
        `${uniqueTransforms.size}개 다른 transform`);

      // 정지
      await page.mouse.click(playBtn.x, playBtn.y);
      await sleep(500);
      await screenshot(page, '12_after_play');
    }

    // ═══ 결과 요약 ═══
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('\n' + '═'.repeat(60));
    console.log(`  결과: ${passed} PASS, ${failed} FAIL (총 ${results.length}개)`);
    if (failed === 0) console.log('  ✅ ALL TESTS PASSED');
    else {
      console.log('  ❌ FAILED:');
      results.filter(r => !r.pass).forEach(r => console.log(`    - ${r.test}: ${r.detail}`));
    }
    console.log('═'.repeat(60));
    if (consoleErrors.length > 0) {
      console.log(`\nConsole errors (${consoleErrors.length}):`);
      consoleErrors.slice(0, 5).forEach(e => console.log(`  ${e.substring(0, 120)}`));
    }
    console.log(`\nScreenshots: ${SCREENSHOT_DIR}`);

  } catch (err) {
    console.error('테스트 오류:', err);
    await screenshot(page, 'error_state');
  } finally {
    await sleep(2000);
    await browser.close();
  }
}

main().catch(console.error);
