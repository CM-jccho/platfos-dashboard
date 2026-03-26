import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const dataDir = path.resolve(process.cwd(), '../data_html');
  const filePath = path.join(dataDir, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Return the content as text
    return new Response(content, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
