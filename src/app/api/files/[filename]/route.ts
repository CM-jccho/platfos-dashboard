import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!filename.match(/^platfos_dashboard_\d{6}\.html$/)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  // Redirect to static file served from public/data/
  return NextResponse.redirect(new URL(`/data/${filename}`, req.url));
}
