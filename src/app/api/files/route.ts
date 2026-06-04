import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';

const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'CM-jccho';
const GITHUB_REPO  = process.env.GITHUB_REPO  ?? 'platfos-dashboard';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional – 없어도 public repo는 OK

function toFileEntry(name: string) {
  const match = name.match(/platfos_dashboard_(\d{6})\.html/);
  if (!match) return null;
  const d = match[1];
  return {
    date: `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`,
    filename: name,
  };
}

export async function GET() {
  const localDataDir = path.join(process.cwd(), 'public', 'data');

  try {
    const localFiles = await readdir(localDataDir);
    const htmlFiles = localFiles
      .filter((name) => name.endsWith('.html'))
      .map(toFileEntry)
      .filter(Boolean);

    return NextResponse.json(htmlFiles);
  } catch {
    // Deployed environments may not have local generated files. Fall back to GitHub.
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/data?ref=${GITHUB_BRANCH}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'platfos-dashboard',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(url, { headers, cache: 'no-store' });

    if (!res.ok) {
      if (res.status === 404) return NextResponse.json([]);
      const body = await res.text();
      console.error('GitHub API error:', res.status, body);
      return NextResponse.json({ error: 'Failed to fetch file list' }, { status: res.status });
    }

    const items: Array<{ name: string; type: string }> = await res.json();
    const htmlFiles = items
      .filter((item) => item.type === 'file' && item.name.endsWith('.html'))
      .map((item) => toFileEntry(item.name))
      .filter(Boolean);

    return NextResponse.json(htmlFiles);
  } catch (error) {
    console.error('fetch error:', error);
    return NextResponse.json({ error: 'Network error' }, { status: 500 });
  }
}
