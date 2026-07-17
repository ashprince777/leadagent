import { NextResponse } from 'next/server';
import { calculateLeadScore, evaluateLeadsWithGroq } from '@/lib/scoring';
import { Lead } from '@/lib/types';

async function discoverLeads(query: string, pageToken?: string | null): Promise<{leads: Lead[], nextPageToken?: string}> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('Google Places API key is missing or invalid. Please check your .env.local file.');
  }

  // 1. Fetch from Places API (New)
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.googleMapsUri,nextPageToken'
    },
    body: JSON.stringify({ textQuery: query, pageToken: pageToken || undefined })
  });
  
  const searchData = await response.json();

  if (!searchData.places) {
    // If no places are found, it might return an empty object.
    if (response.ok) return { leads: [] };
    throw new Error('Failed to fetch from Google Places API');
  }

  // Process all returned places (usually up to 20 by default)
  const topResults = searchData.places;

  // Smart filtering
  const queryLower = query.toLowerCase();
  const isDoctorSearch = queryLower.includes('doctor');
  const isClinicSearch = queryLower.includes('clinic');
  const isHospitalSearch = queryLower.includes('hospital');
  const isCollegeSearch = queryLower.includes('college');

  const filteredResults = topResults.filter((place: any) => {
    const nameLower = (place.displayName?.text || '').toLowerCase();
    const typeLower = (place.primaryTypeDisplayName?.text || '').toLowerCase();
    
    const isHospital = nameLower.includes('hospital') || typeLower.includes('hospital');
    const isCollege = nameLower.includes('college') || typeLower.includes('college') || typeLower.includes('education');
    const isClinic = nameLower.includes('clinic') || typeLower.includes('clinic');
    
    if (isDoctorSearch && !isHospitalSearch && isHospital) {
      return false; // Skip hospitals
    }
    if (isDoctorSearch && !isCollegeSearch && isCollege) {
      return false; // Skip colleges
    }
    if (isDoctorSearch && !isClinicSearch && isClinic) {
      return false; // Skip clinics
    }
    
    return true;
  });

  const rawLeads: Partial<Lead>[] = [];

  for (const place of filteredResults) {
    const hasWebsite = !!place.websiteUri;
    
    rawLeads.push({
      id: place.id,
      businessName: place.displayName?.text || 'Unknown Business',
      category: place.primaryTypeDisplayName?.text || 'Business',
      location: place.formattedAddress || 'Unknown',
      phone: place.nationalPhoneNumber || null,
      email: null, // Google Places API does not return emails
      website: place.websiteUri || null,
      facebook: null,
      instagram: `https://www.google.com/search?q=${encodeURIComponent((place.displayName?.text || '') + ' ' + (place.formattedAddress || '') + ' instagram')}`,
      googleBusiness: place.googleMapsUri || null,
      websiteStatus: hasWebsite ? 'Active' : 'No Website',
      digitalPresenceScore: hasWebsite ? 80 : 20
    });
  }

  const aiEvaluations = await evaluateLeadsWithGroq(rawLeads);

  const finalLeads = rawLeads.map(raw => {
    const evaluation = aiEvaluations.find(e => e.id === raw.id) || calculateLeadScore(raw);
    return {
      ...raw,
      leadScore: evaluation.score,
      recommendedService: evaluation.recommendedService,
      reasonSelected: evaluation.reason,
      isHotLead: evaluation.isHotLead,
      createdAt: new Date().toISOString()
    } as Lead;
  });

  return { leads: finalLeads, nextPageToken: searchData.nextPageToken };
}

async function searchSerperWeb(query: string, page: number = 1): Promise<{leads: Lead[], nextPageToken?: string}> {
  const apiKey = process.env.SERPER_API_KEY;
  
  if (!apiKey) {
    throw new Error('Serper API key is missing.');
  }

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: query,
      page: page
    })
  });
  const data = await response.json();

  if (!data.organic || data.organic.length === 0) {
    return { leads: [] };
  }

  const rawLeads: Partial<Lead>[] = data.organic.map((item: any, index: number) => {
    return {
      id: `web-${page}-${index}`,
      businessName: item.title,
      category: 'Web Search Result',
      location: 'Online / Unknown',
      phone: null,
      email: null,
      website: item.link,
      facebook: null,
      instagram: `https://www.google.com/search?q=${encodeURIComponent((item.title || '') + ' instagram')}`,
      googleBusiness: null,
      websiteStatus: 'Active',
      digitalPresenceScore: 70
    };
  });

  const aiEvaluations = await evaluateLeadsWithGroq(rawLeads);

  const finalLeads = rawLeads.map(raw => {
    const evaluation = aiEvaluations.find(e => e.id === raw.id) || calculateLeadScore(raw);
    return {
      ...raw,
      leadScore: evaluation.score,
      recommendedService: evaluation.recommendedService,
      reasonSelected: evaluation.reason,
      isHotLead: evaluation.isHotLead,
      createdAt: new Date().toISOString()
    } as Lead;
  });

  const nextPageToken = data.organic.length > 0 && page < 10 ? String(page + 1) : undefined;

  return { leads: finalLeads, nextPageToken };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || 'Doctors in Kerala';
  const pageToken = searchParams.get('pageToken');
  const source = searchParams.get('source') || 'maps';

  try {
    let result;
    if (source === 'web') {
      result = await searchSerperWeb(query, pageToken ? parseInt(pageToken, 10) : 1);
    } else {
      result = await discoverLeads(query, pageToken);
    }
    return NextResponse.json({ success: true, leads: result.leads, nextPageToken: result.nextPageToken });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Failed to fetch leads' }, { status: 500 });
  }
}
