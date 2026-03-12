interface Env {
  GITHUB_TOKEN: string;
}

const REPO_OWNER = 'groove1027';
const REPO_NAME = 'all-in-one-production';

interface IssueStatus {
  issueNumber: number;
  state: 'open' | 'closed';
  closedAt: string | null;
  latestComment: string | null;
}

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
  const issuesParam = url.searchParams.get('issues');
  if (!issuesParam) {
    return new Response(
      JSON.stringify({ error: 'Missing issues parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const issueNumbers = issuesParam.split(',').map(Number).filter(n => n > 0).slice(0, 20);
  if (issueNumbers.length === 0) {
    return new Response(
      JSON.stringify({ statuses: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AllInOneProduction-Feedback',
  };

  const statuses: IssueStatus[] = [];

  for (const num of issueNumbers) {
    try {
      const issueRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${num}`,
        { headers: ghHeaders },
      );
      if (!issueRes.ok) {
        statuses.push({ issueNumber: num, state: 'open', closedAt: null, latestComment: null });
        continue;
      }

      const issueData = await issueRes.json() as { state: string; closed_at: string | null };
      let latestComment: string | null = null;

      if (issueData.state === 'closed') {
        try {
          const commentsRes = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${num}/comments?per_page=1&direction=desc`,
            { headers: ghHeaders },
          );
          if (commentsRes.ok) {
            const comments = await commentsRes.json() as { body?: string }[];
            if (comments.length > 0 && comments[0].body) {
              const cleaned = comments[0].body
                .split('\n')
                .filter((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('---'))
                .join('\n')
                .trim();
              latestComment = cleaned.length > 1000 ? cleaned.slice(0, 1000) + '...' : cleaned;
            }
          }
        } catch { /* ignore comment fetch error */ }
      }

      statuses.push({
        issueNumber: num,
        state: issueData.state === 'closed' ? 'closed' : 'open',
        closedAt: issueData.closed_at,
        latestComment,
      });
    } catch {
      statuses.push({ issueNumber: num, state: 'open', closedAt: null, latestComment: null });
    }
  }

  return new Response(
    JSON.stringify({ statuses }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
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
