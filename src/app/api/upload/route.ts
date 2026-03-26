import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? 'main';

export async function POST(req: NextRequest) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return NextResponse.json(
      { error: 'GitHub environment variables not configured' },
      { status: 500 }
    );
  }

  const { htmlContent, date } = await req.json();

  if (!htmlContent || !date) {
    return NextResponse.json({ error: 'Missing content or date' }, { status: 400 });
  }

  const dateParts = date.split('-');
  if (dateParts.length !== 3) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const yy = dateParts[0].substring(2);
  const mm = dateParts[1];
  const dd = dateParts[2];
  const dateStr = `${yy}${mm}${dd}`;
  const filename = `platfos_dashboard_${dateStr}.html`;
  const filePath = `public/data/${filename}`;

  const contentBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64');

  // Check if file already exists (need SHA for updates)
  const checkUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const checkRes = await fetch(checkUrl, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });

  let sha: string | undefined;
  if (checkRes.ok) {
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const uploadUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const body: Record<string, string> = {
    message: `data: add ${filename}`,
    content: contentBase64,
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message }, { status: res.status });
    }

    return NextResponse.json({ success: true, filename, path: `/data/${filename}` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload file to GitHub' }, { status: 500 });
  }
}
