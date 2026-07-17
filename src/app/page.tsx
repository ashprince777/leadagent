'use client';

import { useState, useEffect } from 'react';
import { Lead, LeadList } from '@/lib/types';
import { Search, MapPin, Phone, Mail, Globe, Flame, RefreshCcw, LogOut, Camera, Save, List, CheckSquare, Calendar, MessageCircle, Download, SearchCode, Loader2, Users, UserCheck, UserX } from 'lucide-react';
import { logout, getSession } from '@/app/actions/auth';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'search' | 'crm' | 'tasks' | 'team'>('search');
  
  // Auth State
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  
  // Search State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('Doctors in Kozhikode');
  const [source, setSource] = useState<'maps' | 'web'>('maps');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  // CRM State
  const [savedLists, setSavedLists] = useState<LeadList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [analyzingLeadId, setAnalyzingLeadId] = useState<string | null>(null);

  useEffect(() => {
    fetchSession();
    fetchLeads();
    fetchCRMLists();
  }, []);

  const fetchSession = async () => {
    const session = await getSession();
    if (session) {
      setUserRole(session.role);
      setUserEmail(session.email);
      if (session.role === 'admin') {
        fetchTeamUsers();
      }
    }
  };

  const fetchTeamUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setTeamUsers(data.users);
      }
    } catch(err) { console.error(err); }
  };

  const updateUserStatus = async (userId: number, status: 'approved' | 'rejected') => {
    if (status === 'rejected') {
      if (!confirm('Are you sure you want to delete this user?')) return;
      await fetch(`/api/users?userId=${userId}`, { method: 'DELETE' });
      setTeamUsers(prev => prev.filter(u => u.id !== userId));
    } else {
      await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, status }) });
      setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    }
  };

  const fetchCRMLists = async () => {
    try {
      const res = await fetch('/api/crm');
      const data = await res.json();
      if (data.success) {
        setSavedLists(data.lists);
      }
    } catch (err) {
      console.error('Failed to load CRM lists', err);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    setNextPageToken(null);
    setSelectedLeads(new Set()); // clear selection
    try {
      const res = await fetch(`/api/leads?query=${encodeURIComponent(query)}&source=${source}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setNextPageToken(data.nextPageToken || null);
      }
    } catch (err) {
      console.error('Failed to fetch leads', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreLeads = async () => {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/leads?query=${encodeURIComponent(query)}&pageToken=${nextPageToken}&source=${source}`);
      const data = await res.json();
      if (data.success) {
        setLeads(prev => [...prev, ...data.leads]);
        setNextPageToken(data.nextPageToken || null);
      }
    } catch (err) {
      console.error('Failed to fetch more leads', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleLeadSelection = (id: string) => {
    const newSet = new Set(selectedLeads);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedLeads(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      const newSet = new Set<string>();
      leads.forEach(l => { if(l.id) newSet.add(l.id); });
      setSelectedLeads(newSet);
    }
  };

  const saveSelectedLeads = async () => {
    const leadsToSave = leads.filter(l => l.id && selectedLeads.has(l.id));
    if (leadsToSave.length === 0) return;

    const listName = query || 'Saved Leads';
    const existingListIndex = savedLists.findIndex(list => list.name === listName);
    
    // Add New status
    const formattedLeadsToSave = leadsToSave.map(l => ({...l, pipelineStatus: 'New' as const}));
    const listId = existingListIndex >= 0 ? savedLists[existingListIndex].id : Date.now().toString();

    // Optimistic UI Update
    let updatedLists = [...savedLists];
    if (existingListIndex >= 0) {
      const existingLeads = updatedLists[existingListIndex].leads;
      const newUniqueLeads = formattedLeadsToSave.filter(
        newLead => !existingLeads.some(ex => ex.id === newLead.id)
      );
      updatedLists[existingListIndex] = {
        ...updatedLists[existingListIndex],
        leads: [...existingLeads, ...newUniqueLeads]
      };
    } else {
      const newList: LeadList = {
        id: listId,
        name: listName,
        createdAt: new Date().toISOString(),
        leads: formattedLeadsToSave
      };
      updatedLists = [newList, ...updatedLists];
    }
    setSavedLists(updatedLists);
    setSelectedLeads(newSet => { newSet.clear(); return new Set(); });
    alert(`Saved ${leadsToSave.length} leads to "${listName}"!`);

    // Persist to DB
    try {
      await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId, listName, leads: formattedLeadsToSave })
      });
    } catch(err) {
      console.error('Failed to save leads to DB', err);
    }
  };

  const updateLeadStatus = async (listId: string, leadId: string, status: 'New' | 'Contacted' | 'Hot Lead' | 'Cold Lead') => {
    // Optimistic
    setSavedLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        leads: list.leads.map(lead => lead.id === leadId ? { ...lead, pipelineStatus: status } : lead)
      };
    }));
    // DB sync
    await fetch('/api/crm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, pipelineStatus: status })
    });
  };

  const assignLead = async (listId: string, leadId: string, assignedTo: string) => {
    try {
      const res = await fetch('/api/crm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, assignedTo })
      });
      if (res.ok) fetchCRMLists();
    } catch (e) {
      console.error(e);
    }
  };

  const updateLeadFollowUp = async (listId: string, leadId: string, date: string) => {
    setSavedLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        leads: list.leads.map(lead => lead.id === leadId ? { ...lead, followUpDate: date } : lead)
      };
    }));
    await fetch('/api/crm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, followUpDate: date })
    });
  };

  const updateLeadCallNotes = async (listId: string, leadId: string, notes: string) => {
    setSavedLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        leads: list.leads.map(lead => lead.id === leadId ? { ...lead, callNotes: notes } : lead)
      };
    }));
    await fetch('/api/crm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, callNotes: notes })
    });
  };

  const deleteList = async (listId: string) => {
    if (confirm('Are you sure you want to delete this list?')) {
      setSavedLists(prev => prev.filter(l => l.id !== listId));
      if (activeListId === listId) setActiveListId(null);
      await fetch(`/api/crm?listId=${listId}`, { method: 'DELETE' });
    }
  };

  const exportListToCSV = (listId: string) => {
    const list = savedLists.find(l => l.id === listId);
    if (!list || list.leads.length === 0) return;

    const headers = [
      'Business Name', 'Category', 'Location', 'Phone', 'Email', 
      'Website', 'Lead Score', 'Recommended Service', 'Pipeline Status', 'Follow-up Date'
    ];

    const escapeCSV = (value: any) => {
      if (value === null || value === undefined) return '""';
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [
      headers.join(','),
      ...list.leads.map(lead => [
        escapeCSV(lead.businessName),
        escapeCSV(lead.category),
        escapeCSV(lead.location),
        escapeCSV(lead.phone),
        escapeCSV(lead.email),
        escapeCSV(lead.website),
        escapeCSV(lead.leadScore),
        escapeCSV(lead.recommendedService),
        escapeCSV(lead.pipelineStatus),
        escapeCSV(lead.followUpDate)
      ].join(','))
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${list.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_leads.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderContactInfo = (lead: Lead) => {
    let whatsappLink = '';
    if (lead.phone) {
      const cleanPhone = lead.phone.replace(/[\s\(\)\-\+]/g, '');
      const message = `Hi ${lead.businessName} team! I came across your business while looking for ${lead.category} in ${lead.location}. We help businesses like yours get more customers. Would love to chat!`;
      whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    }

    return (
      <div className="flex flex-col gap-2 text-sm">
        {lead.phone && (
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-1 xl:gap-2">
            <span className="flex items-center gap-2 text-gray-600"><Phone className="w-3 h-3"/> {lead.phone}</span>
            <a href={whatsappLink} target="_blank" className="flex items-center gap-1 text-green-600 hover:bg-green-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-green-200 transition-colors w-fit">
              <MessageCircle className="w-3 h-3"/> WhatsApp
            </a>
          </div>
        )}
        {lead.email && <span className="flex items-center gap-2 text-gray-600"><Mail className="w-3 h-3"/> {lead.email}</span>}
        {lead.instagram && (
          <a href={lead.instagram} target="_blank" className="flex items-center gap-2 text-pink-600 hover:underline">
            <Camera className="w-3 h-3"/> Find on Instagram
          </a>
        )}
      </div>
    );
  };

  const renderDigitalStatus = (lead: Lead) => (
    <>
      {lead.website ? (
        <a href={lead.website} target="_blank" className="flex items-center gap-1 text-blue-600 hover:underline">
          <Globe className="w-3 h-3"/> {lead.websiteStatus}
        </a>
      ) : (
        <span className="text-red-500 font-medium">{lead.websiteStatus}</span>
      )}
    </>
  );

  const analyzeWebsite = async (listId: string, lead: Lead) => {
    if (!lead.website || !lead.id) return;
    setAnalyzingLeadId(lead.id);
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(lead.website)}`);
      const data = await res.json();
      if (data.success && data.analysis) {
        // Optimistic UI
        setSavedLists(prev => prev.map(list => {
          if (list.id !== listId) return list;
          return {
            ...list,
            leads: list.leads.map(l => l.id === lead.id ? { ...l, websiteAnalysis: data.analysis } : l)
          };
        }));
        // Sync to DB
        await fetch('/api/crm', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, websiteAnalysis: data.analysis })
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzingLeadId(null);
    }
  };

  const renderWebsiteAnalysis = (listId: string, lead: Lead) => {
    if (!lead.website) return null;
    return (
      <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-100">
        {!lead.websiteAnalysis ? (
          <button 
            onClick={() => analyzeWebsite(listId, lead)}
            disabled={analyzingLeadId === lead.id}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {analyzingLeadId === lead.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <SearchCode className="w-3 h-3"/>}
            {analyzingLeadId === lead.id ? 'Analyzing...' : 'Analyze Tech Stack & Services'}
          </button>
        ) : (
          <div className="text-sm">
            <p className="font-semibold text-gray-800 mb-1">🤖 AI Summary</p>
            <p className="text-gray-600 mb-3 leading-relaxed">{lead.websiteAnalysis.aiSummary}</p>
            
            <p className="font-semibold text-gray-800 mb-2">🛠️ Tech Stack Detected</p>
            <div className="flex gap-2 flex-wrap">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${lead.websiteAnalysis.hasWordPress ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                {lead.websiteAnalysis.hasWordPress ? '✅ WordPress' : '❌ No WordPress'}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${lead.websiteAnalysis.hasGoogleAds ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                {lead.websiteAnalysis.hasGoogleAds ? '✅ Google Ads/Analytics' : '❌ No Google Tracking'}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${lead.websiteAnalysis.hasFacebookPixel ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                {lead.websiteAnalysis.hasFacebookPixel ? '✅ Facebook Pixel' : '❌ No Facebook Pixel'}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Get Today's date for task filtering
  const today = new Date().toISOString().split('T')[0];
  
  // Compute tasks for today
  const dueTasks = savedLists.flatMap(list => 
    list.leads
      .filter(l => l.followUpDate && l.followUpDate <= today && l.pipelineStatus !== 'Cold Lead')
      .map(l => ({ ...l, listId: list.id, listName: list.name }))
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-24">
      <header className="bg-white border-b border-gray-200 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Foxora Lead Gen AI</h1>
          <div className="flex gap-4 mt-3">
            <button 
              onClick={() => setActiveTab('search')} 
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === 'search' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <div className="flex items-center gap-2"><Search className="w-4 h-4"/> Discover Leads</div>
            </button>
            <button 
              onClick={() => setActiveTab('crm')} 
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === 'crm' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <div className="flex items-center gap-2"><List className="w-4 h-4"/> My CRM Lists</div>
            </button>
            <button 
              onClick={() => setActiveTab('tasks')} 
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === 'tasks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4"/> Tasks for Today
                {dueTasks.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{dueTasks.length}</span>
                )}
              </div>
            </button>
            {userRole === 'admin' && (
              <button 
                onClick={() => setActiveTab('team')} 
                className={`text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === 'team' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4"/> Team
                  {teamUsers.filter(u => u.status === 'pending').length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{teamUsers.filter(u => u.status === 'pending').length}</span>
                  )}
                </div>
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          {activeTab === 'search' && (
            <>
              <select 
                value={source} 
                onChange={(e) => setSource(e.target.value as 'maps' | 'web')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-sm"
              >
                <option value="maps">Google Maps</option>
                <option value="web">Google Search</option>
              </select>
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none w-72"
                placeholder="e.g. Salons in Kochi"
                onKeyDown={e => e.key === 'Enter' && fetchLeads()}
              />
              <button 
                onClick={fetchLeads}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Discover
              </button>
            </>
          )}
          {userEmail && <span className="text-sm text-gray-500 font-medium">Logged in as: {userEmail}</span>}
          <button 
            onClick={() => logout()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors border border-gray-300 ml-4"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {activeTab === 'search' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-gray-500 text-sm font-medium">Total Leads Found</h3>
                <p className="text-3xl font-bold mt-2">{leads.length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-gray-500 text-sm font-medium">Hot Leads (&gt;80 Score)</h3>
                <p className="text-3xl font-bold mt-2 text-orange-600">
                  {leads.filter(l => l.isHotLead).length}
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-gray-500 text-sm font-medium">Missing Websites</h3>
                <p className="text-3xl font-bold mt-2 text-red-600">
                  {leads.filter(l => l.websiteStatus === 'No Website').length}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
                    <th className="py-4 px-4 font-medium w-12 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={leads.length > 0 && selectedLeads.size === leads.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="py-4 px-4 font-medium">Business</th>
                    <th className="py-4 px-4 font-medium">Contact</th>
                    <th className="py-4 px-4 font-medium">Digital Status</th>
                    <th className="py-4 px-4 font-medium">Lead Score</th>
                    <th className="py-4 px-4 font-medium">Recommended Service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map((lead, i) => (
                    <tr key={lead.id || i} className={`transition-colors ${selectedLeads.has(lead.id || '') ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                      <td className="py-4 px-4 text-center">
                         <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedLeads.has(lead.id || '')}
                          onChange={() => lead.id && toggleLeadSelection(lead.id)}
                        />
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{lead.businessName}</span>
                          {lead.isHotLead && <Flame className="w-4 h-4 text-orange-500" />}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <MapPin className="w-3 h-3" /> {lead.location} • {lead.category}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {renderContactInfo(lead)}
                      </td>
                      <td className="py-4 px-4 text-sm">
                        {renderDigitalStatus(lead)}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-full bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div 
                              className={`h-2 rounded-full ${lead.leadScore > 75 ? 'bg-green-500' : lead.leadScore > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                              style={{ width: `${lead.leadScore}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-bold">{lead.leadScore}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {lead.recommendedService}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">{lead.reasonSelected}</p>
                      </td>
                    </tr>
                  ))}
                  {leads.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500">
                        No leads found. Enter a query to start discovering!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {nextPageToken && (
              <div className="mt-8 flex justify-center pb-8">
                <button
                  onClick={loadMoreLeads}
                  disabled={loadingMore}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-xl font-medium shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? <RefreshCcw className="w-5 h-5 animate-spin text-gray-500" /> : null}
                  {loadingMore ? 'Loading...' : 'Load More Leads'}
                </button>
              </div>
            )}

            {/* Sticky Save Button */}
            {selectedLeads.size > 0 && (
              <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 z-50">
                <div className="flex items-center gap-2 font-medium">
                  <CheckSquare className="w-5 h-5 text-blue-400"/>
                  {selectedLeads.size} Leads Selected
                </div>
                <button 
                  onClick={saveSelectedLeads}
                  className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-full font-semibold transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4"/>
                  Save to List
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'crm' && (
          <div className="flex gap-8 h-[calc(100vh-160px)]">
            {/* CRM Sidebar */}
            <div className="w-72 bg-white rounded-xl border border-gray-200 shadow-sm overflow-y-auto shrink-0 flex flex-col">
              <div className="p-4 border-b border-gray-100 font-bold text-gray-800">My Lead Lists</div>
              <div className="p-2 flex-1">
                {savedLists.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center mt-4">No lists saved yet.</p>
                ) : (
                  savedLists.map(list => (
                    <div 
                      key={list.id} 
                      onClick={() => setActiveListId(list.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors mb-1 group flex justify-between items-center ${activeListId === list.id ? 'bg-blue-50 border border-blue-100 text-blue-800' : 'hover:bg-gray-50 border border-transparent'}`}
                    >
                      <div>
                        <div className="font-semibold text-sm truncate w-40">{list.name}</div>
                        <div className="text-xs text-gray-500">{list.leads.length} leads</div>
                        {userRole === 'admin' && list.userEmail && (
                          <div className="text-[10px] text-blue-600 truncate w-40 mt-0.5">By: {list.userEmail}</div>
                        )}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        title="Delete List"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CRM Main Area */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              {activeListId && savedLists.find(l => l.id === activeListId) ? (
                <>
                  <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl font-bold text-gray-900">{savedLists.find(l => l.id === activeListId)?.name}</h2>
                        {userRole === 'admin' && savedLists.find(l => l.id === activeListId)?.userEmail && (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-0.5 rounded-full font-medium">
                            {savedLists.find(l => l.id === activeListId)?.userEmail}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{savedLists.find(l => l.id === activeListId)?.leads.length} saved leads in this list</p>
                    </div>
                    <button 
                      onClick={() => exportListToCSV(activeListId)}
                      className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
                    >
                      <Download className="w-4 h-4"/>
                      Export to CSV
                    </button>
                  </div>
                  <div className="overflow-auto flex-1 p-0">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-gray-50 shadow-sm">
                        <tr className="border-b border-gray-200 text-sm text-gray-500">
                          <th className="py-4 px-6 font-medium">Business</th>
                          <th className="py-4 px-6 font-medium">Contact Info</th>
                          <th className="py-4 px-6 font-medium">Pipeline & Follow-up</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {savedLists.find(l => l.id === activeListId)?.leads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-semibold text-gray-900">{lead.businessName}</div>
                              <div className="text-xs text-gray-500 mt-1">{lead.category} • {lead.location}</div>
                              {renderWebsiteAnalysis(activeListId, lead)}
                            </td>
                            <td className="py-4 px-6">
                               {renderContactInfo(lead)}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-2">
                                <select 
                                  value={lead.pipelineStatus || 'New'}
                                  onChange={(e) => updateLeadStatus(activeListId, lead.id!, e.target.value as any)}
                                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg border-0 ring-1 ring-inset focus:ring-2 focus:ring-blue-600 outline-none w-fit
                                    ${lead.pipelineStatus === 'Hot Lead' ? 'bg-orange-50 text-orange-700 ring-orange-600/20' : 
                                      lead.pipelineStatus === 'Cold Lead' ? 'bg-gray-100 text-gray-700 ring-gray-600/20' : 
                                      lead.pipelineStatus === 'Contacted' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' : 
                                      'bg-green-50 text-green-700 ring-green-600/20'}
                                  `}
                                >
                                  <option value="New">🟢 New</option>
                                  <option value="Contacted">🔵 Contacted</option>
                                  <option value="Hot Lead">🔥 Hot Lead</option>
                                  <option value="Cold Lead">❄️ Cold Lead</option>
                                </select>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-gray-400"/>
                                  <input 
                                    type="date" 
                                    value={lead.followUpDate || ''}
                                    onChange={(e) => updateLeadFollowUp(activeListId, lead.id!, e.target.value)}
                                    className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    title="Follow-up Date"
                                  />
                                </div>
                                {userRole === 'admin' && (
                                  <select 
                                    value={lead.assignedTo || ''}
                                    onChange={(e) => assignLead(activeListId, lead.id!, e.target.value)}
                                    className="text-xs border border-blue-200 bg-blue-50 text-blue-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                                  >
                                    <option value="">Assign To...</option>
                                    {teamUsers.filter(u => u.status === 'approved').map(u => (
                                      <option key={u.id} value={u.email}>{u.email}</option>
                                    ))}
                                  </select>
                                )}
                                <textarea
                                  placeholder="Call notes..."
                                  value={lead.callNotes || ''}
                                  onChange={(e) => updateLeadCallNotes(activeListId, lead.id!, e.target.value)}
                                  className="w-full text-xs border border-gray-300 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-16 mt-1"
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                  <List className="w-12 h-12 mb-4 text-gray-300" />
                  <p>Select a list from the sidebar to view your saved leads.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-160px)]">
             <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Tasks for Today</h2>
                <p className="text-sm text-gray-500">Leads that need follow-up today or are overdue.</p>
              </div>
              <div className="text-red-500 font-bold bg-red-50 px-4 py-1.5 rounded-lg border border-red-100">
                {dueTasks.length} Due
              </div>
            </div>
            <div className="overflow-auto flex-1 p-0">
              {dueTasks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 h-full mt-24">
                  <CheckSquare className="w-12 h-12 mb-4 text-green-400" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm mt-1">You have no leads scheduled for follow-up today.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 shadow-sm">
                    <tr className="border-b border-gray-200 text-sm text-gray-500">
                      <th className="py-4 px-6 font-medium">List Name</th>
                      <th className="py-4 px-6 font-medium">Business</th>
                      <th className="py-4 px-6 font-medium">Contact Info</th>
                      <th className="py-4 px-6 font-medium">Pipeline & Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dueTasks.map((lead) => (
                      <tr key={`${lead.listId}-${lead.id}`} className="hover:bg-red-50/30 transition-colors">
                        <td className="py-4 px-6">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
                            {lead.listName}
                           </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="font-semibold text-gray-900">{lead.businessName}</div>
                          <div className="text-xs text-gray-500 mt-1">{lead.category} • {lead.location}</div>
                          {renderWebsiteAnalysis(lead.listId, lead as Lead)}
                        </td>
                        <td className="py-4 px-6">
                            {renderContactInfo(lead as Lead)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-col gap-2">
                            <select 
                              value={lead.pipelineStatus || 'New'}
                              onChange={(e) => updateLeadStatus(lead.listId, lead.id!, e.target.value as any)}
                              className={`px-3 py-1.5 text-sm font-semibold rounded-lg border-0 ring-1 ring-inset focus:ring-2 focus:ring-blue-600 outline-none w-fit
                                ${lead.pipelineStatus === 'Hot Lead' ? 'bg-orange-50 text-orange-700 ring-orange-600/20' : 
                                  lead.pipelineStatus === 'Cold Lead' ? 'bg-gray-100 text-gray-700 ring-gray-600/20' : 
                                  lead.pipelineStatus === 'Contacted' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' : 
                                  'bg-green-50 text-green-700 ring-green-600/20'}
                              `}
                            >
                              <option value="New">🟢 New</option>
                              <option value="Contacted">🔵 Contacted</option>
                              <option value="Hot Lead">🔥 Hot Lead</option>
                              <option value="Cold Lead">❄️ Cold Lead</option>
                            </select>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-red-400"/>
                              <input 
                                type="date" 
                                value={lead.followUpDate || ''}
                                onChange={(e) => updateLeadFollowUp(lead.listId, lead.id!, e.target.value)}
                                className="text-xs border border-red-300 rounded px-2 py-1 text-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-bold bg-red-50"
                                title="Follow-up Date"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TEAM MANAGEMENT TAB */}
        {activeTab === 'team' && userRole === 'admin' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <Users className="h-6 w-6 mr-2 text-blue-600" />
                Team Approvals
              </h2>
              {teamUsers.length === 0 ? (
                <p className="text-gray-500">No users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {teamUsers.map(u => (
                        <tr key={u.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{u.role}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {u.status === 'pending' && (
                              <button onClick={() => updateUserStatus(u.id, 'approved')} className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md mr-2">
                                Approve
                              </button>
                            )}
                            {u.role !== 'admin' && (
                              <button onClick={() => updateUserStatus(u.id, 'rejected')} className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md">
                                {u.status === 'pending' ? 'Reject' : 'Remove'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
