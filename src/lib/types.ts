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
}
