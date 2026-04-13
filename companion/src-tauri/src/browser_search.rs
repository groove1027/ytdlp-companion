//! WebView 이미지 검색 모듈
//!
//! 실제 Chrome 브라우저를 사용하여 구글/네이버 이미지를 검색합니다.
//! HTTP 스크래핑(reqwest)은 봇 탐지로 차단되지만,
//! 실제 브라우저는 일반 사용자와 구분할 수 없어서 차단 불가능합니다.
//!
//! 사용법:
//!   POST /api/browser-google-search  { query, count?, hl? }
//!   POST /api/browser-naver-search   { query, count? }

use headless_chrome::{Browser, LaunchOptions, Tab};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

// ── 타입 ──

#[derive(Deserialize)]
pub struct BrowserSearchRequest {
    pub query: String,
    #[serde(default = "default_count")]
    pub count: usize,
    #[serde(default = "default_hl")]
    pub hl: String,
}

fn default_count() -> usize {
    20
}
fn default_hl() -> String {
    "ko".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BrowserImageResult {
    pub url: String,
    pub thumbnail: String,
    pub width: u32,
    pub height: u32,
    pub title: String,
    pub source: String,
    pub source_url: String,
}

#[derive(Serialize)]
pub struct BrowserSearchResponse {
    pub images: Vec<BrowserImageResult>,
    pub total: usize,
    pub provider: String,
    pub query: String,
}

// ── 브라우저 싱글톤 ──

static BROWSER_INSTANCE: std::sync::OnceLock<Mutex<Option<Browser>>> = std::sync::OnceLock::new();

fn browser_mutex() -> &'static Mutex<Option<Browser>> {
    BROWSER_INSTANCE.get_or_init(|| Mutex::new(None))
}

/// Chrome 브라우저를 시작하거나 기존 인스턴스를 재사용합니다.
/// 실패 시 None을 반환합니다 (Chrome 미설치 등).
/// [FIX] Windows에서는 headless_chrome가 블랙 윈도우를 생성하므로 비활성화.
/// 프론트엔드의 JSON API 폴백이 동일하게 동작하므로 기능 손실 없음.
async fn get_or_create_browser() -> Result<Browser, String> {
    #[cfg(target_os = "windows")]
    {
        return Err("Windows에서는 headless_chrome 비활성화 (블랙 윈도우 방지). JSON API 폴백을 사용합니다.".to_string());
    }
    let mut guard = browser_mutex().lock().await;

    // 기존 브라우저가 살아있는지 확인
    if let Some(ref browser) = *guard {
        // 간단한 health check — 새 탭을 열 수 있으면 살아있음
        if browser.new_tab().is_ok() {
            // 탭 열기 성공 = 브라우저 살아있음, 방금 연 탭은 닫기
            if let Ok(tabs) = browser.get_tabs().lock() {
                if tabs.len() > 1 {
                    // 마지막 탭(방금 연 것)을 닫기
                    // 실패해도 무시
                    let _ = tabs.last().map(|t| t.close(true));
                }
            }
            return Ok(
                guard
                    .take()
                    .ok_or_else(|| "브라우저 인스턴스 take 실패".to_string())?,
            );
        }
        // 브라우저 죽었음 — 새로 만들기
        *guard = None;
    }

    // 새 브라우저 시작
    // [FIX] Windows 블랙 윈도우 방지:
    // - window_size 제거 (headless와 충돌 → 창 표시될 수 있음)
    // - headless: true만 유지
    let launch_options = LaunchOptions {
        headless: true,
        window_size: None,
        idle_browser_timeout: Duration::from_secs(300),
        ..Default::default()
    };

    match Browser::new(launch_options) {
        Ok(browser) => Ok(browser),
        Err(e) => Err(format!("Chrome 시작 실패 (Chrome이 설치되어 있는지 확인): {e}")),
    }
}

/// 사용 후 브라우저를 싱글톤에 반납합니다.
async fn return_browser(browser: Browser) {
    // 모든 탭 닫기 (about:blank만 남김)
    if let Ok(tabs) = browser.get_tabs().lock() {
        for tab in tabs.iter().skip(1) {
            let _ = tab.close(true);
        }
    }
    let mut guard = browser_mutex().lock().await;
    *guard = Some(browser);
}

// ── 구글 이미지 검색 ──

pub async fn google_image_search(
    query: &str,
    count: usize,
    hl: &str,
) -> Result<BrowserSearchResponse, String> {
    let query_owned = query.to_string();
    let count = count.min(100);
    let hl_owned = hl.to_string();

    // headless_chrome는 동기 API — spawn_blocking으로 실행
    let browser = get_or_create_browser().await?;

    let (search_result, browser) = tokio::task::spawn_blocking(move || {
        let result = google_search_sync(&browser, &query_owned, count, &hl_owned);
        let query_for_response = query_owned;
        (result, browser, query_for_response)
    })
    .await
    .map(|(result, browser, query)| {
        (result.map(|images| {
            let total = images.len();
            BrowserSearchResponse {
                images,
                total,
                provider: "google-webview".to_string(),
                query,
            }
        }), browser)
    })
    .map_err(|e| format!("spawn_blocking 실패: {e}"))?;

    return_browser(browser).await;
    search_result
}

fn google_search_sync(
    browser: &Browser,
    query: &str,
    count: usize,
    hl: &str,
) -> Result<Vec<BrowserImageResult>, String> {
    let tab = browser
        .new_tab()
        .map_err(|e| format!("탭 생성 실패: {e}"))?;

    // [핵심] 먼저 google.com에 방문하여 쿠키/세션 확보 → fetch()로 JSON API 호출
    // 실제 Chrome의 fetch()이므로 봇 탐지 불가능
    tab.navigate_to("https://www.google.com/")
        .map_err(|e| format!("구글 이동 실패: {e}"))?;

    tab.wait_until_navigated()
        .map_err(|e| format!("페이지 로드 대기 실패: {e}"))?;

    std::thread::sleep(Duration::from_millis(1500));

    let encoded = urlencoding::encode(query);
    let fetch_url = format!(
        "https://www.google.com/search?q={encoded}&tbm=isch&asearch=isch&async=_fmt:json,p:1,ijn:0&safe=active&hl={hl}&gl=kr"
    );

    // 구글 페이지 컨텍스트에서 fetch() — 동일 출처이므로 쿠키 자동 포함
    let js_code = format!(
        r#"
        (async () => {{
            try {{
                const res = await fetch("{fetch_url}");
                const raw = await res.text();
                const jsonText = raw.replace(/^\)\]\}}'\s*\n?/, '').trim();

                const data = JSON.parse(jsonText);
                const metadata = (data.ischj && data.ischj.metadata) || [];

                const results = [];
                for (const item of metadata) {{
                    const orig = item.original_image || {{}};
                    const r = item.result || {{}};
                    const url = orig.url || '';
                    if (!url || url.includes('gstatic.com')) continue;
                    results.push({{
                        url: url,
                        thumbnail: (item.thumbnail && item.thumbnail.url) || '',
                        width: orig.width || 0,
                        height: orig.height || 0,
                        title: r.page_title || item.title || '',
                        source: r.site_title || '',
                        source_url: r.referrer_url || '',
                    }});
                    if (results.length >= {count}) break;
                }}
                return JSON.stringify(results);
            }} catch (e) {{
                return JSON.stringify({{ error: e.message }});
            }}
        }})()
        "#
    );

    let result = tab
        .evaluate(&js_code, true) // await_promise=true — async fetch 결과 대기
        .map_err(|e| format!("JS 실행 실패: {e}"))?;

    let json_str = result
        .value
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "[]".to_string());

    let _ = tab.close(true);

    // 에러 응답 확인
    if json_str.contains("\"error\"") {
        if let Ok(err_obj) = serde_json::from_str::<serde_json::Value>(&json_str) {
            if let Some(err_msg) = err_obj.get("error").and_then(|v| v.as_str()) {
                return Err(format!(
                    "구글 WebView 파싱 실패: {} (body sample: {})",
                    err_msg,
                    err_obj
                        .get("sample")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                ));
            }
        }
    }

    let images: Vec<BrowserImageResult> =
        serde_json::from_str(&json_str).unwrap_or_default();

    Ok(images)
}

// ── 네이버 이미지 검색 ──

pub async fn naver_image_search(
    query: &str,
    count: usize,
) -> Result<BrowserSearchResponse, String> {
    let query_owned = query.to_string();
    let count = count.min(50);

    let browser = get_or_create_browser().await?;

    let (search_result, browser) = tokio::task::spawn_blocking(move || {
        let result = naver_search_sync(&browser, &query_owned, count);
        let query_for_response = query_owned;
        (result, browser, query_for_response)
    })
    .await
    .map(|(result, browser, query)| {
        (result.map(|images| {
            let total = images.len();
            BrowserSearchResponse {
                images,
                total,
                provider: "naver-webview".to_string(),
                query,
            }
        }), browser)
    })
    .map_err(|e| format!("spawn_blocking 실패: {e}"))?;

    return_browser(browser).await;
    search_result
}

fn naver_search_sync(
    browser: &Browser,
    query: &str,
    count: usize,
) -> Result<Vec<BrowserImageResult>, String> {
    let tab = browser
        .new_tab()
        .map_err(|e| format!("탭 생성 실패: {e}"))?;

    let encoded = urlencoding::encode(query);
    let url = format!(
        "https://search.naver.com/search.naver?where=image&query={encoded}&sm=tab_jum"
    );

    tab.navigate_to(&url)
        .map_err(|e| format!("네이버 이동 실패: {e}"))?;

    tab.wait_until_navigated()
        .map_err(|e| format!("페이지 로드 대기 실패: {e}"))?;

    std::thread::sleep(Duration::from_millis(2000));

    let js_code = r#"
        (() => {
            const results = [];
            const imgs = document.querySelectorAll('.thumb img, ._image_source img, .img_wrap img, [class*=image] img');
            for (const img of imgs) {
                const src = img.dataset.lazySrc || img.dataset.src || img.src || '';
                if (!src || src.startsWith('data:') || src.includes('static.naver')) continue;
                const link = img.closest('a');
                results.push({
                    url: src,
                    thumbnail: img.src || src,
                    width: parseInt(img.getAttribute('data-width') || img.naturalWidth || '0'),
                    height: parseInt(img.getAttribute('data-height') || img.naturalHeight || '0'),
                    title: img.alt || '',
                    source: '',
                    source_url: link ? link.href || '' : '',
                });
                if (results.length >= __MAX_COUNT__) break;
            }
            return JSON.stringify(results);
        })()
    "#
    .replace("__MAX_COUNT__", &count.to_string());

    let result = tab
        .evaluate(&js_code, false)
        .map_err(|e| format!("JS 실행 실패: {e}"))?;

    let json_str = result
        .value
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "[]".to_string());

    let _ = tab.close(true);

    let images: Vec<BrowserImageResult> =
        serde_json::from_str(&json_str).unwrap_or_default();

    Ok(images)
}

// ── 브라우저 사용 가능 여부 확인 ──

pub async fn is_browser_available() -> bool {
    match get_or_create_browser().await {
        Ok(browser) => {
            return_browser(browser).await;
            true
        }
        Err(_) => false,
    }
}
