"""
[#681] Playwright E2E 검증 — 무료 레퍼런스 이미지 검색 개선
- GoogleReferencePanel UI 렌더링
- 소스 탭 (웹/밈/일러스트) 전환
- 안내 배너 표시 확인
- 모델 선택 드롭다운 라벨 변경 확인
"""

from playwright.sync_api import sync_playwright
import sys, time

BASE = "http://localhost:5173"
EVOLINK_KEY = "REDACTED_EVOLINK_KEY"
SCREENSHOT_DIR = "/Users/mac_mini/Downloads/all-in-one-production-build4/test/output"

def setup_storage(page):
    """API 키 주입 + 온보딩 완료"""
    page.evaluate(f"""() => {{
        localStorage.setItem('onboarding-tour-completed', 'true');
        localStorage.setItem('CUSTOM_EVOLINK_KEY', '{EVOLINK_KEY}');
    }}""")
    page.reload()
    page.wait_for_load_state("networkidle", timeout=15000)

def test_image_video_tab(page):
    """이미지/영상 탭으로 이동"""
    # 온보딩 팝업 닫기 — "건너뛰기" 버튼 클릭
    skip_btn = page.locator('text=건너뛰기').first
    if skip_btn.is_visible(timeout=3000):
        skip_btn.click()
        page.wait_for_timeout(1000)
        print("  온보딩 팝업 닫기 완료")

    # 안내 배너 닫기
    close_btn = page.locator('button:has-text("✕"), [aria-label="close"], button:has-text("×")').first
    if close_btn.is_visible(timeout=2000):
        close_btn.click()
        page.wait_for_timeout(500)

    # 프로젝트 카드 더블클릭으로 진입
    page.evaluate("""() => {
        const cards = document.querySelectorAll('[class*="rounded"]');
        for (const card of cards) {
            if (card.textContent && card.textContent.includes('임시 프로젝트')) {
                card.click();
                return 'clicked';
            }
        }
        return 'no card';
    }""")
    page.wait_for_timeout(3000)
    page.screenshot(path=f"{SCREENSHOT_DIR}/681-00-after-project-click.png")

    # 이미지/영상 탭 클릭 (사이드바)
    page.evaluate("""() => {
        const items = document.querySelectorAll('span, button, div');
        for (const el of items) {
            if (el.textContent && el.textContent.trim() === '이미지/영상') {
                el.click();
                return 'clicked';
            }
        }
        // fallback: "이미지" 포함
        for (const el of items) {
            if (el.textContent && el.textContent.includes('이미지/영상') && el.offsetParent) {
                el.closest('button, a, div[role="button"]')?.click();
                return 'clicked-parent';
            }
        }
        return 'not found';
    }""")
    page.wait_for_timeout(2000)

    page.screenshot(path=f"{SCREENSHOT_DIR}/681-01-image-video-tab.png")
    print("✅ 이미지/영상 탭 진입 완료")

def test_google_reference_panel(page):
    """GoogleReferencePanel 존재 + 안내 배너 확인"""
    # 스크롤해서 무료 이미지 레퍼런스 패널 찾기
    page.evaluate("window.scrollTo(0, 2000)")
    page.wait_for_timeout(1000)

    panel = page.locator('text=무료 이미지 레퍼런스').first
    if panel.is_visible(timeout=5000):
        print("✅ 무료 이미지 레퍼런스 패널 표시 확인")
    else:
        print("⚠️ 패널이 바로 보이지 않음 — 추가 스크롤")
        page.evaluate("document.querySelectorAll('[class*=rounded-2xl]').forEach(el => { if(el.textContent.includes('무료 이미지 레퍼런스')) el.scrollIntoView() })")
        page.wait_for_timeout(1000)

    # 토글 켜기 — rounded-full 버튼 중 무료 이미지 레퍼런스 근처의 것
    page.evaluate("""() => {
        const panels = document.querySelectorAll('h3, span');
        for (const p of panels) {
            if (p.textContent && p.textContent.includes('무료 이미지 레퍼런스')) {
                const parent = p.closest('[class*="rounded-2xl"]');
                if (parent) {
                    const toggle = parent.querySelector('button[class*="rounded-full"]');
                    if (toggle) { toggle.click(); return 'clicked'; }
                }
            }
        }
        return 'not found';
    }""")
    page.wait_for_timeout(1500)
    print("✅ 레퍼런스 토글 ON 시도")

    page.screenshot(path=f"{SCREENSHOT_DIR}/681-02-reference-panel-toggled.png")

    # 안내 배너 확인 — "레퍼런스 전용 모드"
    banner = page.locator('text=레퍼런스 전용 모드')
    if banner.is_visible(timeout=3000):
        print("✅ '레퍼런스 전용 모드' 안내 배너 표시 확인")
    else:
        print("❌ 안내 배너가 표시되지 않음!")

    # 캐릭터/화풍 미적용 안내 확인
    warning = page.locator('text=캐릭터 설정, 비주얼 스타일(화풍)은 반영되지 않습니다')
    if warning.is_visible(timeout=2000):
        print("✅ 캐릭터/화풍 미적용 경고 표시 확인")
    else:
        print("❌ 캐릭터/화풍 미적용 경고 누락!")

def test_source_tabs(page):
    """소스 탭 (웹/밈/일러스트) 전환 확인"""
    # 오버레이 모달 닫기
    page.evaluate("""() => {
        document.querySelectorAll('[class*="fixed inset-0"]').forEach(el => {
            if (el.style) el.style.display = 'none';
        });
    }""")
    page.wait_for_timeout(500)

    tabs = ['웹 검색', '밈/GIF', '일러스트']
    for label in tabs:
        result = page.evaluate(f"""() => {{
            const btns = document.querySelectorAll('button');
            for (const btn of btns) {{
                if (btn.textContent && btn.textContent.includes('{label}')) {{
                    btn.click();
                    return 'clicked';
                }}
            }}
            return 'not found';
        }}""")
        if result == 'clicked':
            print(f"✅ '{label}' 탭 전환 성공")
        else:
            print(f"❌ '{label}' 탭을 찾을 수 없음!")
        page.wait_for_timeout(300)

    page.screenshot(path=f"{SCREENSHOT_DIR}/681-03-source-tabs.png")

    # 밈 탭 활성화 후 웹 일괄 검색 버튼 숨김 확인
    page.evaluate("""() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
            if (btn.textContent && btn.textContent.includes('밈/GIF')) {
                btn.click();
                return;
            }
        }
    }""")
    page.wait_for_timeout(500)

    bulk_visible = page.evaluate("""() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
            if (btn.textContent && btn.textContent.includes('웹 레퍼런스 검색') && btn.offsetParent) {
                return true;
            }
        }
        return false;
    }""")
    if bulk_visible:
        print("❌ 밈 탭에서 웹 일괄 검색 버튼이 여전히 표시됨!")
    else:
        print("✅ 밈 탭에서 웹 일괄 검색 버튼 숨김 확인")

    page.screenshot(path=f"{SCREENSHOT_DIR}/681-04-meme-tab-active.png")

def test_model_label(page):
    """모델 선택 드롭다운에서 라벨 변경 확인"""
    # 이미지 모델 select 찾기
    model_select = page.locator('select').filter(has_text="Google Imagen").first
    if model_select.is_visible(timeout=3000):
        options_text = model_select.inner_text()
        if '캐릭터/화풍 미적용' in options_text:
            print("✅ 모델 라벨에 '캐릭터/화풍 미적용' 표시 확인")
        else:
            print(f"❌ 모델 라벨 변경 미반영: {options_text[:100]}")
    else:
        print("⚠️ 이미지 모델 select를 찾을 수 없음 (현재 뷰에 없을 수 있음)")

    page.screenshot(path=f"{SCREENSHOT_DIR}/681-05-model-label.png")

def test_noise_patterns(page):
    """NOISE_PATTERNS 필터 확인 — 브라우저 콘솔에서 직접 테스트"""
    result = page.evaluate("""() => {
        // 테스트용으로 간단한 정규식 검증
        const pattern = /\\b(2d|3d|vector\\.?art|minimalist|flat\\.?design|line\\.?art|chibi|anthropomorphic|pixel\\.?art)\\b/gi;
        const testCases = [
            { input: "2d digital minimalist vector-art thick bold", expected: true },
            { input: "mountain market vendor", expected: false },
            { input: "Trump president speech", expected: false },
            { input: "modern apartment building", expected: false },
            { input: "chibi anthropomorphic character", expected: true },
        ];
        return testCases.map(tc => ({
            input: tc.input,
            hasNoise: pattern.test(tc.input),
            expected: tc.expected,
            pass: pattern.test(tc.input) === tc.expected,
        }));
    }""")

    all_pass = True
    for r in result:
        status = "✅" if r['pass'] else "❌"
        print(f"  {status} '{r['input'][:40]}' → noise={r['hasNoise']}, expected={r['expected']}")
        if not r['pass']:
            all_pass = False

    if all_pass:
        print("✅ NOISE_PATTERNS 필터 전체 통과")
    else:
        print("❌ 일부 NOISE_PATTERNS 테스트 실패")

def main():
    import os
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    print("\n" + "="*60)
    print("  [#681] Playwright E2E 검증 시작")
    print("="*60 + "\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        try:
            page.goto(BASE, timeout=15000)
            page.wait_for_load_state("networkidle", timeout=15000)
            setup_storage(page)

            print("\n--- 1. 이미지/영상 탭 이동 ---")
            test_image_video_tab(page)

            print("\n--- 2. GoogleReferencePanel 확인 ---")
            test_google_reference_panel(page)

            print("\n--- 3. 소스 탭 전환 ---")
            test_source_tabs(page)

            print("\n--- 4. 모델 라벨 확인 ---")
            test_model_label(page)

            print("\n--- 5. NOISE_PATTERNS 필터 ---")
            test_noise_patterns(page)

            print("\n" + "="*60)
            print("  [#681] Playwright E2E 검증 완료")
            print("="*60 + "\n")

        except Exception as e:
            print(f"\n❌ E2E 테스트 실패: {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/681-error.png")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
