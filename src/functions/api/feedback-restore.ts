interface Env {
  GITHUB_TOKEN: string;
}

const REPO_OWNER = 'groove1027';
const REPO_NAME = 'all-in-one-production';

interface RestoredIssue {
  issueNumber: number;
  submittedAt: number;
  feedbackType: string;
  messagePreview: string;
  state: 'open' | 'closed';
  closedAt: string | null;
}

/**
 * /api/feedback-restore?email=xxx
 * 이메일로 GitHub 이슈를 검색하여 사용자의 피드백 히스토리를 복구합니다.
 * (#515) 새 기기/세션에서 로그인 시 localStorage가 비어있는 문제 해결
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const token = context.env.GITHUB_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'GITHUB_TOKEN not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');
  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Missing email parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AllInOneProduction-Feedback',
  };

  try {
    // GitHub Search API: 해당 이메일이 포함된 이슈 검색 (최근 50개)
    const query = encodeURIComponent(`repo:${REPO_OWNER}/${REPO_NAME} is:issue "${email}" in:body`);
    const searchRes = await fetch(
      `https://api.github.com/search/issues?q=${query}&sort=created&order=desc&per_page=50`,
      { headers: ghHeaders },
    );

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ issues: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchRes.json() as {
      items: {
        number: number;
        title: string;
        state: string;
        created_at: string;
        closed_at: string | null;
        labels: { name: string }[];
      }[];
    };

    const issues: RestoredIssue[] = searchData.items.map(item => {
      // 제목에서 피드백 유형 추출: [Bug], [Feature], [Error], 기타
      let feedbackType = 'other';
      if (item.title.startsWith('[Bug]')) feedbackType = 'bug';
      else if (item.title.startsWith('[Feature]')) feedbackType = 'suggestion';
      else if (item.title.startsWith('[Error]')) feedbackType = 'error';

      // 제목에서 메시지 미리보기 추출 (태그 제거)
      const messagePreview = item.title.replace(/^\[(Bug|Feature|Error|Other)\]\s*/i, '').slice(0, 200);

      return {
        issueNumber: item.number,
        submittedAt: new Date(item.created_at).getTime(),
        feedbackType,
        messagePreview,
        state: item.state === 'closed' ? 'closed' as const : 'open' as const,
        closedAt: item.closed_at,
      };
    });

    return new Response(
      JSON.stringify({ issues }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ issues: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
