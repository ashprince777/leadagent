import { NextResponse } from 'next/server';
import { calculateLeadScore } from '@/lib/scoring';
import { Lead } from '@/lib/types';

async function discoverLeads(query: string): Promise<Lead[]> {
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
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.googleMapsUri'
    },
    body: JSON.stringify({ textQuery: query })
  });
  
  const searchData = await response.json();

  if (!searchData.places) {
    // If no places are found, it might return an empty object.
    if (response.ok) return [];
    throw new Error('Failed to fetch from Google Places API');
  }

  // Process all returned places (usually up to 20 by default)
  const topResults = searchData.places;

  // Smart filtering: If the user searches for doctors/clinics, filter out big hospitals.
  const queryLower = query.toLowerCase();
  const isDoctorSearch = queryLower.includes('doctor') || queryLower.includes('clinic');
  const isHospitalSearch = queryLower.includes('hospital');

  const filteredResults = topResults.filter((place: any) => {
    const nameLower = (place.displayName?.text || '').toLowerCase();
    const typeLower = (place.primaryTypeDisplayName?.text || '').toLowerCase();
    const isHospital = nameLower.includes('hospital') || typeLower.includes('hospital');
    
    if (isDoctorSearch && !isHospitalSearch && isHospital) {
      return false; // Skip hospitals
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
      instagram: null,
      googleBusiness: place.googleMapsUri || null,
      websiteStatus: hasWebsite ? 'Active' : 'No Website',
      digitalPresenceScore: hasWebsite ? 80 : 20
    });
  }

  return rawLeads.map(raw => {
    const evaluation = calculateLeadScore(raw);
    return {
      ...raw,
      leadScore: evaluation.score,
      recommendedService: evaluation.recommendedService,
      reasonSelected: evaluation.reason,
      isHotLead: evaluation.isHotLead,
      createdAt: new Date().toISOString()
    } as Lead;
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || 'Doctors in Kerala';

  try {
    const leads = await discoverLeads(query);
    return NextResponse.json({ success: true, leads });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch leads' }, { status: 500 });
  }
}
