import { NextResponse } from 'next/server';
import { Client } from 'pg';

function getClient() {
  let url = process.env.POSTGRES_URL || '';
  if (url.includes('?')) url = url.split('?')[0];
  return new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
}

// GET all lists and leads
export async function GET(req: Request) {
  const role = req.headers.get('x-user-role');
  const email = req.headers.get('x-user-email');

  const client = getClient();
  try {
    await client.connect();
    
    // Fetch lists
    let listsRes;
    if (role === 'admin') {
      listsRes = await client.query('SELECT * FROM lead_lists ORDER BY created_at DESC');
    } else {
      listsRes = await client.query('SELECT * FROM lead_lists WHERE user_email = $1 ORDER BY created_at DESC', [email]);
    }
    const lists = listsRes.rows;
    
    // Fetch leads (only those owned by user or assigned to them)
    let leadsRes;
    if (role === 'admin') {
      leadsRes = await client.query('SELECT * FROM leads ORDER BY created_at DESC');
    } else {
      leadsRes = await client.query(`
        SELECT * FROM leads 
        WHERE list_id IN (SELECT id FROM lead_lists WHERE user_email = $1)
        OR assigned_to = $1
        ORDER BY created_at DESC
      `, [email]);
    }
    const leads = leadsRes.rows;

    const formatLead = (l: any) => ({
      id: l.id,
      businessName: l.business_name,
      category: l.category,
      location: l.location,
      phone: l.phone,
      email: l.email,
      website: l.website,
      facebook: l.facebook,
      instagram: l.instagram,
      googleBusiness: l.google_business,
      websiteStatus: l.website_status,
      digitalPresenceScore: l.digital_presence_score,
      leadScore: l.lead_score,
      recommendedService: l.recommended_service,
      reasonSelected: l.reason_selected,
      isHotLead: l.is_hot_lead,
      pipelineStatus: l.pipeline_status,
      followUpDate: l.follow_up_date,
      assignedTo: l.assigned_to,
      callNotes: l.call_notes,
      websiteAnalysis: l.has_wordpress !== null ? {
        hasWordPress: l.has_wordpress,
        hasGoogleAds: l.has_google_ads,
        hasFacebookPixel: l.has_facebook_pixel,
        aiSummary: l.ai_summary
      } : undefined
    });

    // Group leads into lists
    const formattedLists = lists.map(list => ({
      id: list.id,
      name: list.name,
      createdAt: list.created_at,
      userEmail: list.user_email,
      leads: leads.filter(l => l.list_id === list.id).map(formatLead)
    }));

    if (role !== 'admin') {
      const assignedLeads = leads.filter(l => l.assigned_to === email && !lists.some(list => list.id === l.list_id));
      if (assignedLeads.length > 0) {
        formattedLists.unshift({
          id: 'assigned-tasks',
          name: '🎯 Assigned by Admin',
          createdAt: new Date().toISOString(),
          userEmail: 'admin',
          leads: assignedLeads.map(formatLead)
        });
      }
    }

    return NextResponse.json({ success: true, lists: formattedLists });
  } catch (error) {
    console.error("GET CRM Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}

// POST: Save new list or new leads
export async function POST(req: Request) {
  const email = req.headers.get('x-user-email');
  const client = getClient();
  try {
    const { listId, listName, leads } = await req.json();
    await client.connect();

    // Check if list exists, if not create it
    const listCheck = await client.query('SELECT id FROM lead_lists WHERE id = $1', [listId]);
    if (listCheck.rows.length === 0) {
      await client.query('INSERT INTO lead_lists (id, name, user_email) VALUES ($1, $2, $3)', [listId, listName, email]);
    }

    // Insert leads
    for (const l of leads) {
       const leadCheck = await client.query('SELECT id FROM leads WHERE id = $1', [l.id]);
       if (leadCheck.rows.length === 0) {
         await client.query(`
           INSERT INTO leads (
             id, list_id, business_name, category, location, phone, email, website, facebook, instagram, google_business,
             website_status, digital_presence_score, lead_score, recommended_service, reason_selected, is_hot_lead, pipeline_status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         `, [
           l.id, listId, l.businessName, l.category, l.location, l.phone, l.email, l.website, l.facebook, l.instagram, l.googleBusiness,
           l.websiteStatus, l.digitalPresenceScore, l.leadScore, l.recommendedService, l.reasonSelected, l.isHotLead, l.pipelineStatus || 'New'
         ]);
       }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST CRM Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}

// PUT: Update lead status, follow-up, analysis, assignment, or notes
export async function PUT(req: Request) {
  const client = getClient();
  try {
    const data = await req.json();
    const { leadId, pipelineStatus, followUpDate, websiteAnalysis, assignedTo, callNotes } = data;
    await client.connect();

    if (pipelineStatus !== undefined) {
      await client.query('UPDATE leads SET pipeline_status = $1 WHERE id = $2', [pipelineStatus, leadId]);
    }
    if (followUpDate !== undefined) {
      await client.query('UPDATE leads SET follow_up_date = $1 WHERE id = $2', [followUpDate, leadId]);
    }
    if (assignedTo !== undefined) {
      const today = new Date().toISOString().split('T')[0];
      await client.query(`
        UPDATE leads 
        SET assigned_to = $1, follow_up_date = COALESCE(follow_up_date, $2)
        WHERE id = $3
      `, [assignedTo, today, leadId]);
    }
    if (callNotes !== undefined) {
      await client.query('UPDATE leads SET call_notes = $1 WHERE id = $2', [callNotes, leadId]);
    }
    if (websiteAnalysis !== undefined) {
      await client.query(`
        UPDATE leads SET 
        has_wordpress = $1, has_google_ads = $2, has_facebook_pixel = $3, ai_summary = $4 
        WHERE id = $5
      `, [websiteAnalysis.hasWordPress, websiteAnalysis.hasGoogleAds, websiteAnalysis.hasFacebookPixel, websiteAnalysis.aiSummary, leadId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT CRM Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}

// DELETE: Delete a list
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const listId = searchParams.get('listId');
  if (!listId) return NextResponse.json({ success: false }, { status: 400 });
  
  const client = getClient();
  try {
    await client.connect();
    await client.query('DELETE FROM lead_lists WHERE id = $1', [listId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE CRM Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}
