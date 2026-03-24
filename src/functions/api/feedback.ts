interface Env {
  GITHUB_TOKEN: string;
}

const REPO_OWNER = 'groove1027';
const REPO_NAME = 'all-in-one-production';

const LABEL_MAP: Record<string, string> = {
  bug: 'bug',
  error: 'bug',
  auth: 'login/signup',
  suggestion: 'enhancement',
  other: 'feedback',
};

const TYPE_EMOJI: Record<string, string> = {
  bug: '\uD83D\uDC1B',
  error: '\uD83D\uDC1B',
  auth: '\uD83D\uDD12',
  suggestion: '\uD83D\uDCA1',
  other: '\uD83D\uDCDD',
};

function formatIssueBody(data: {
  type: string;
  message: string;
  email?: string;
  userAgent: string;
  appVersion: string;
  currentProjectId?: string;
  screenshotUrls?: string[];
  timestamp: number;
  userDisplayName?: string;
  debugLogs?: string;
  debugLogUrl?: string;
  breadcrumbs?: string;
  stateSnapshot?: string;
  autoScreenshotUrl?: string;
  webVitals?: string;
  reproductionSteps?: string;
  interactionReplay?: string;
  costSnapshot?: string;
  detailedIdbSummary?: string;
}): string {
  const date = new Date(data.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const sections: string[] = [];

  sections.push(`## ${TYPE_EMOJI[data.type] || '\uD83D\uDCDD'} ${data.type.toUpperCase()} 피드백`);
  sections.push(`> 접수 시각: ${date}`);
  sections.push('');
  sections.push('### 내용');
  sections.push(data.message);

  if (data.screenshotUrls && data.screenshotUrls.length > 0) {
    sections.push('');
    sections.push('### 스크린샷');
    data.screenshotUrls.forEach((url, i) => {
      sections.push(`![screenshot-${i + 1}](${url})`);
    });
  }

  // 자동 캡처 스크린샷
  if (data.autoScreenshotUrl) {
    sections.push('');
    sections.push('### 자동 캡처 화면');
    sections.push(`![auto-screenshot](${data.autoScreenshotUrl})`);
  }

  // Breadcrumb Trail (사용자 행동 추적)
  if (data.breadcrumbs) {
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><strong>사용자 행동 기록 (Breadcrumb Trail)</strong> (클릭하여 펼치기)</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.breadcrumbs.substring(0, 5000));
    sections.push('```');
    sections.push('</details>');
  }

  // State Snapshot (앱 상태)
  if (data.stateSnapshot) {
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><strong>앱 상태 스냅샷</strong> (클릭하여 펼치기)</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.stateSnapshot.substring(0, 8000));
    sections.push('```');
    sections.push('</details>');
  }

  // ── 강화된 진단 데이터 ──

  // Core Web Vitals
  if (data.webVitals) {
    sections.push('');
    sections.push('### Core Web Vitals');
    sections.push('```');
    sections.push(data.webVitals.substring(0, 2000));
    sections.push('```');
  }

  // 자동 생성 재현 단계
  if (data.reproductionSteps) {
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><strong>자동 생성 재현 단계</strong> (클릭하여 펼치기)</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.reproductionSteps.substring(0, 5000));
    sections.push('```');
    sections.push('</details>');
  }

  // 인터랙션 리플레이 (최근 60초)
  if (data.interactionReplay) {
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><strong>인터랙션 리플레이 (최근 60초)</strong> (클릭하여 펼치기)</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.interactionReplay.substring(0, 8000));
    sections.push('```');
    sections.push('</details>');
  }

  // 세션 비용 요약
  if (data.costSnapshot) {
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><strong>세션 비용 요약</strong> (클릭하여 펼치기)</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.costSnapshot.substring(0, 2000));
    sections.push('```');
    sections.push('</details>');
  }

  // IndexedDB 상세 요약
  if (data.detailedIdbSummary) {
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><strong>IndexedDB 상세 요약</strong> (클릭하여 펼치기)</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.detailedIdbSummary.substring(0, 5000));
    sections.push('```');
    sections.push('</details>');
  }

  sections.push('');
  sections.push('### 환경 정보');
  sections.push(`| 항목 | 값 |`);
  sections.push(`|------|-----|`);
  if (data.userDisplayName) {
    sections.push(`| 사용자 | ${data.userDisplayName} |`);
  }
  if (data.email) {
    sections.push(`| 이메일 | ${data.email} |`);
  }
  sections.push(`| 앱 버전 | ${data.appVersion} |`);
  sections.push(`| 브라우저 | ${data.userAgent.substring(0, 120)} |`);
  if (data.currentProjectId) {
    sections.push(`| 프로젝트 ID | \`${data.currentProjectId}\` |`);
  }

  // 디버그 로그 (접이식) — 환경 스냅샷 + 액션 트레일 + 전체 로그 포함
  if (data.debugLogs || data.debugLogUrl) {
    sections.push('');
    if (data.debugLogUrl) {
      sections.push(`> 📋 [전체 진단 로그 보기](${data.debugLogUrl})`);
      sections.push('');
    }
    if (data.debugLogs) {
      sections.push('<details>');
      sections.push('<summary><strong>디버그 로그 (환경 + 액션 + API)</strong> (클릭하여 펼치기)</summary>');
      sections.push('');
      sections.push('```');
      // GitHub issue body 최대 65536자 — 로그가 너무 길면 잘라냄
      const maxLogLen = 40000;
      if (data.debugLogs.length > maxLogLen) {
        sections.push(data.debugLogs.substring(0, maxLogLen));
        sections.push(`\n... (${data.debugLogs.length - maxLogLen}자 생략)`);
      } else {
        sections.push(data.debugLogs);
      }
      sections.push('```');
      sections.push('</details>');
    }
  }

  return sections.join('\n');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const token = context.env.GITHUB_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'GITHUB_TOKEN not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const data = await context.request.json() as {
      type: string;
      message: string;
      email?: string;
      userAgent: string;
      appVersion: string;
      currentProjectId?: string;
      screenshotUrls?: string[];
      timestamp: number;
      userDisplayName?: string;
      debugLogs?: string;
      debugLogUrl?: string;
      breadcrumbs?: string;
      stateSnapshot?: string;
      autoScreenshotUrl?: string;
      webVitals?: string;
      reproductionSteps?: string;
      interactionReplay?: string;
      costSnapshot?: string;
      detailedIdbSummary?: string;
    };

    const titlePrefix = data.type === 'bug' || data.type === 'error' ? 'Bug' : data.type === 'auth' ? 'Auth' : data.type === 'suggestion' ? 'Feature' : 'Feedback';
    const titleText = data.message.replace(/\n/g, ' ').substring(0, 80);
    const title = `[${titlePrefix}] ${titleText}${data.message.length > 80 ? '...' : ''}`;

    const label = LABEL_MAP[data.type] || 'feedback';
    let body = formatIssueBody(data);

    // GitHub Issue body 최대 65536자 — 초과 시 잘라냄
    const MAX_BODY_LEN = 63000; // 마크다운 오버헤드 고려 여유분
    if (body.length > MAX_BODY_LEN) {
      body = body.substring(0, MAX_BODY_LEN) + '\n\n---\n> ⚠️ 이슈 본문이 GitHub 제한(65536자)에 가까워 일부 진단 데이터가 생략되었습니다.';
    }

    const ghResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AllInOneProduction-Feedback',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: [label] }),
    });

    if (!ghResponse.ok) {
      const errText = await ghResponse.text();
      return new Response(
        JSON.stringify({ error: 'GitHub API error', detail: errText }),
        { status: ghResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const issue = await ghResponse.json() as { html_url: string; number: number };
    return new Response(
      JSON.stringify({ success: true, issueUrl: issue.html_url, issueNumber: issue.number }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
