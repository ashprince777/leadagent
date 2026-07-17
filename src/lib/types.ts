export interface WebsiteAnalysis {
  hasWordPress: boolean;
  hasGoogleAds: boolean;
  hasFacebookPixel: boolean;
  aiSummary: string;
}

export interface Lead {
  id?: string;
  businessName: string;
  category: string;
  location: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  googleBusiness: string | null;
  websiteStatus: 'Active' | 'No Website' | 'Outdated Website' | 'Unknown';
  digitalPresenceScore: number;
  leadScore: number;
  recommendedService: string;
  reasonSelected: string;
  isHotLead: boolean;
  createdAt?: string;
  pipelineStatus?: 'New' | 'Contacted' | 'Hot Lead' | 'Cold Lead';
  followUpDate?: string;
  assignedTo?: string;
  callNotes?: string;
  websiteAnalysis?: WebsiteAnalysis;
}

export interface LeadList {
  id: string;
  name: string;
  createdAt: string;
  userEmail?: string;
  leads: Lead[];
}
