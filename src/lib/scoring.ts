import { Lead } from './types';

export function calculateLeadScore(lead: Partial<Lead>): { score: number; recommendedService: string; reason: string; isHotLead: boolean } {
  let score = 0;
  const reasons: string[] = [];

  // Core Website checks
  if (lead.websiteStatus === 'No Website') {
    score += 30;
    reasons.push('No website found');
  } else if (lead.websiteStatus === 'Outdated Website') {
    score += 20;
    reasons.push('Website is outdated');
  }

  // Social Media checks
  if (!lead.facebook && !lead.instagram) {
    score += 10;
    reasons.push('Weak social media presence');
  }

  // Contact Info checks
  if (lead.phone) score += 5;
  if (lead.email) score += 5;

  // Google Business checks
  if (!lead.googleBusiness) {
    score += 10;
    reasons.push('No Google Business Profile');
  } else {
    // Assuming if they have it but we evaluated it as weak, we'd add 10 (Placeholder for more complex logic)
  }

  // Business Growth
  // In a real app, this would be determined by review count / social following growth
  // For demo, we randomly add 15 for some active businesses
  const isGrowing = Math.random() > 0.5; 
  if (isGrowing) {
    score += 15;
    reasons.push('Business appears active and growing');
  }

  // Determine Recommended Service
  let recommendedService = '';
  if (lead.websiteStatus === 'No Website') {
    recommendedService = 'Website Development';
  } else if (lead.websiteStatus === 'Outdated Website') {
    recommendedService = 'Website Redesign';
  } else if (!lead.facebook && !lead.instagram) {
    recommendedService = 'Social Media Marketing';
  } else if (!lead.googleBusiness) {
    recommendedService = 'Google Business Optimization';
  } else {
    recommendedService = 'Website + SEO + Social Media Package';
  }

  // Determine Hot Lead status
  const isHotLead = score >= 80 || lead.websiteStatus === 'No Website' || isGrowing;

  return {
    score: Math.min(score, 100), // Cap at 100
    recommendedService,
    reason: reasons.join(', ') || 'General Digital Upgrade',
    isHotLead
  };
}

export async function evaluateLeadsWithGroq(leads: Partial<Lead>[]): Promise<{id: string, score: number, recommendedService: string, reason: string, isHotLead: boolean}[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return leads.map(l => ({ id: l.id!, ...calculateLeadScore(l) }));

  const simplifiedLeads = leads.map(l => ({
    id: l.id,
    businessName: l.businessName,
    website: l.website,
    hasWebsite: l.websiteStatus === 'Active',
    category: l.category
  }));

  const systemPrompt = `You are an expert digital marketing lead evaluator. You are given a list of local businesses.
You need to evaluate their digital presence and output a JSON array of evaluations.
Return a JSON object in this exact format:
{
  "evaluations": [
    {
      "id": "lead-id-here",
      "score": <number 0-100, higher if they desperately need a website or marketing>,
      "recommendedService": "<Service like 'Website Development', 'SEO Optimization', etc>",
      "reason": "<Short reason why>",
      "isHotLead": <true if score > 80>
    }
  ]
}
Critically, evaluate EVERY lead in the list.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        response_format: { type: "json_object" },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ leads: simplifiedLeads }) }
        ],
        temperature: 0.1
      })
    });
    
    const data = await response.json();
    if (data.choices && data.choices[0]) {
      const parsed = JSON.parse(data.choices[0].message.content);
      if (parsed.evaluations && Array.isArray(parsed.evaluations)) {
        return parsed.evaluations;
      }
    }
  } catch (error) {
    console.error("Groq evaluation failed", error);
  }
  
  // Fallback
  return leads.map(l => ({ id: l.id!, ...calculateLeadScore(l) }));
}
