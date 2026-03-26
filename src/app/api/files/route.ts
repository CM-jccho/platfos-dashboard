import { NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? 'main';

export async function GET() {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return NextResponse.json(
      { error: 'GitHub environment variables not configured' },
      { status: 500 }
    );
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/data?ref=${GITHUB_BRANCH}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: 'Failed to fetch file list' }, { status: res.status });
    }

    const items: Array<{ name: string; type: string }> = await res.json();
    const htmlFiles = items
      .filter((item) => item.type === 'file' && item.name.endsWith('.html'))
      .map((item) => {
        const match = item.name.match(/platfos_dashboard_(\d{6})\.html/);
        if (!match) return null;
        const dateStr = match[1];
        const formattedDate = `20${dateStr.substring(0, 2)}-${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}`;
        return {
          date: formattedDate,
          filename: item.name,
          path: `/data/${item.name}`,
        };
      })
      .filter(Boolean);

    return NextResponse.json(htmlFiles);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch file list' }, { status: 500 });
  }
}
