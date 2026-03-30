import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? 'main';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!filename.match(/^platfos_dashboard_\d{6}\.html$/)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return NextResponse.json({ error: 'GitHub env not configured' }, { status: 500 });
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/data/${filename}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const data = await res.json();
    const html = Buffer.from(data.content, 'base64').toString('utf-8');

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
