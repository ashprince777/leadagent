'use client';

import { useState, useEffect } from 'react';
import { Lead } from '@/lib/types';
import { Search, MapPin, Phone, Mail, Globe, Flame, RefreshCcw } from 'lucide-react';

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('Doctors in Kozhikode');

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.error('Failed to fetch leads', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Foxora Lead Gen AI</h1>
          <p className="text-sm text-gray-500 mt-1">Discover, evaluate, and acquire high-quality business leads.</p>
        </div>
        <div className="flex gap-4">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none w-72"
            placeholder="e.g. Salons in Kochi"
          />
          <button 
            onClick={fetchLeads}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Discover Leads
          </button>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        
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

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
                <th className="py-4 px-6 font-medium">Business</th>
                <th className="py-4 px-6 font-medium">Contact</th>
                <th className="py-4 px-6 font-medium">Digital Status</th>
                <th className="py-4 px-6 font-medium">Lead Score</th>
                <th className="py-4 px-6 font-medium">Recommended Service</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{lead.businessName}</span>
                      {lead.isHotLead && <Flame className="w-4 h-4 text-orange-500" />}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3 h-3" /> {lead.location} • {lead.category}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex flex-col gap-1 text-sm">
                      {lead.phone && <span className="flex items-center gap-2 text-gray-600"><Phone className="w-3 h-3"/> {lead.phone}</span>}
                      {lead.email && <span className="flex items-center gap-2 text-gray-600"><Mail className="w-3 h-3"/> {lead.email}</span>}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm">
                    {lead.website ? (
                      <a href={lead.website} target="_blank" className="flex items-center gap-1 text-blue-600 hover:underline">
                        <Globe className="w-3 h-3"/> {lead.websiteStatus}
                      </a>
                    ) : (
                      <span className="text-red-500 font-medium">{lead.websiteStatus}</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
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
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {lead.recommendedService}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{lead.reasonSelected}</p>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    No leads found. Enter a query to start discovering!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
