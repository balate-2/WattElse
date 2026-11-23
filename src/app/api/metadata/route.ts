import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WattElseBot/1.0)',
      },
    });
    const html = await res.text();

    // Extraction simple des balises OpenGraph ou HTML standard
    const titleMatch =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const descMatch =
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

    const imageMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    const decodeHtml = (str: string) =>
      str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    return NextResponse.json({
      title: titleMatch ? decodeHtml(titleMatch[1].trim()) : '',
      description: descMatch ? decodeHtml(descMatch[1].trim()) : '',
      image: imageMatch ? imageMatch[1].trim() : '',
    });
  } catch {
    return NextResponse.json({ error: 'Impossible de lire le lien' }, { status: 500 });
  }
}
