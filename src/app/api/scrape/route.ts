import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
  }

  try {
    let urlToFetch = targetUrl;
    if (!urlToFetch.startsWith('http')) {
      urlToFetch = 'https://' + urlToFetch;
    }

    const response = await fetch(urlToFetch, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) throw new Error('Failed to fetch website');
    
    const html = await response.text();
    const $ = cheerio.load(html);

    // Tech Stack Detection
    const htmlString = html.toLowerCase();
    const hasWordPress = htmlString.includes('wp-content') || htmlString.includes('wp-includes');
    const hasGoogleAds = htmlString.includes('gtag') || htmlString.includes('googletagmanager') || htmlString.includes('google-analytics');
    const hasFacebookPixel = htmlString.includes('fbevents.js') || htmlString.includes('fbq(');

    // Extract text for AI
    $('script, style, noscript, iframe, img, svg').remove();
    let textContent = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Limit to 3000 chars to save tokens and time
    if (textContent.length > 3000) textContent = textContent.substring(0, 3000);

    let aiSummary = "Website lacks sufficient text for analysis.";

    if (textContent.length > 50) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are an expert sales analyst. Given the extracted text from a business's website, provide a concise 1-2 sentence summary of exactly what they do, what services they offer, and who their target audience is. Keep it highly professional and brief."
          },
          {
            role: "user",
            content: `Website Text: ${textContent}`
          }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
      });
      aiSummary = completion.choices[0]?.message?.content || "No summary available.";
    }

    return NextResponse.json({
      success: true,
      analysis: {
        hasWordPress,
        hasGoogleAds,
        hasFacebookPixel,
        aiSummary
      }
    });

  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json({ 
      success: true, // Return success so UI doesn't break, just empty state
      analysis: {
        hasWordPress: false,
        hasGoogleAds: false,
        hasFacebookPixel: false,
        aiSummary: "Could not access website for scraping."
      } 
    });
  }
}
