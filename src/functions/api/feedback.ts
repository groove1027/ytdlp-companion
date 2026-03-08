interface Env {
  GITHUB_TOKEN: string;
}

const REPO_OWNER = 'groove1027';
const REPO_NAME = 'all-in-one-production';

const LABEL_MAP: Record<string, string> = {
  bug: 'bug',
  error: 'bug',
  suggestion: 'enhancement',
  other: 'feedback',
};

const TYPE_EMOJI: Record<string, string> = {
  bug: '\uD83D\uDC1B',
  error: '\uD83D\uDC1B',
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
    };

    const titlePrefix = data.type === 'bug' || data.type === 'error' ? 'Bug' : data.type === 'suggestion' ? 'Feature' : 'Feedback';
    const titleText = data.message.replace(/\n/g, ' ').substring(0, 80);
    const title = `[${titlePrefix}] ${titleText}${data.message.length > 80 ? '...' : ''}`;

    const label = LABEL_MAP[data.type] || 'feedback';
    const body = formatIssueBody(data);

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
