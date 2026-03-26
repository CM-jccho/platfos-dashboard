import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const dataDir = path.join(process.cwd(), '../data_html');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    const files = fs.readdirSync(dataDir);
    const htmlFiles = files
      .filter((file) => file.endsWith('.html'))
      .map((file) => {
        // Extract date from filename format: platfos_dashboard_YYMMDD.html
        const match = file.match(/platfos_dashboard_(\d{6})\.html/);
        if (match) {
          const dateStr = match[1];
          // Convert YYMMDD to YYYY-MM-DD (assuming 20xx)
          const formattedDate = `20${dateStr.substring(0, 2)}-${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}`;
          return {
            date: formattedDate,
            filename: file,
            path: `/api/files/${file}`,
          };
        }
        return null;
      })
      .filter(Boolean);

    return NextResponse.json(htmlFiles);
  } catch (error) {
    console.error('Error reading files:', error);
    return NextResponse.json({ error: 'Failed to read files' }, { status: 500 });
  }
}
