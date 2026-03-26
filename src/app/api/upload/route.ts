import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const { htmlContent, date } = await req.json();

  if (!htmlContent || !date) {
    return NextResponse.json({ error: 'Missing content or date' }, { status: 400 });
  }

  // Convert YYYY-MM-DD to YYMMDD
  const dateParts = date.split('-');
  if (dateParts.length !== 3) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const yy = dateParts[0].substring(2);
  const mm = dateParts[1];
  const dd = dateParts[2];
  const dateStr = `${yy}${mm}${dd}`;

  const dataDir = path.join(process.cwd(), '../data_html');
  const filename = `platfos_dashboard_${dateStr}.html`;
  const filePath = path.join(dataDir, filename);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('Error saving file:', error);
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
