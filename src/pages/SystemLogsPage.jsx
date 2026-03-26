import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";

export default function SystemLogsPage() {
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState('STAFF');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const tabs = [
    { id: 'STAFF', label: 'Staff Management' },
    { id: 'INVENTORY', label: 'Inventory Changes' },
    { id: 'STUDENTS', label: 'Student Imports' },
    { id: 'SUPPLIERS', label: 'Supplier Updates' }
  ];

  if (userRole !== 'SUPER_ADMIN') {
    return <div className="p-10 text-center text-error font-bold">403: Forbidden Access</div>;
  }

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, count, error } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .eq('entity_type', activeTab)
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setLogs(data);
        setTotalCount(count || 0);
      } else {
        setLogs([]);
        setTotalCount(0);
      }
      setLoading(false);
    };

    fetchLogs();
  }, [activeTab, currentPage]);

  // Tab switch handler: reset pagination
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setCurrentPage(1);
  };

  const getActionBadge = (actionType) => {
    switch (actionType) {
      case 'INVITE': return <span className="text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Invited</span>;
      case 'REVOKE': return <span className="text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Revoked</span>;
      case 'REACTIVATE': return <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Reactivated</span>;
      case 'DEACTIVATE': return <span className="text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Deactivated</span>;
      case 'CHANGE_ROLE': return <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Role Change</span>;
      case 'UPDATE_NAME': return <span className="text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Name Change</span>;
      default: return <span className="text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">{actionType}</span>;
    }
  };

  const renderDetails = (log) => {
    if (!log.new_values && !log.old_values && !log.metadata) return <span className="text-slate-400 italic">No details captured</span>;
    
    // --- HUMAN READABLE STAFF LOGS ---
    if (log.action_type === 'CHANGE_ROLE') {
      return <span>Changed role from <b className="text-slate-700">{log.old_values?.role?.replace('_', ' ')}</b> to <b className="text-indigo-600">{log.new_values?.role?.replace('_', ' ')}</b></span>;
    }
    if (log.action_type === 'UPDATE_NAME') {
      return <span>Renamed personnel from <b className="text-slate-700">{log.old_values?.full_name}</b> to <b className="text-indigo-600">{log.new_values?.full_name}</b></span>;
    }
    if (log.action_type === 'INVITE') {
      return <span>Sent invitation for <b className="text-slate-700">{log.new_values?.email}</b> as <b className="text-indigo-600">{log.new_values?.role?.replace('_', ' ')}</b></span>;
    }
    if (log.action_type === 'DEACTIVATE') {
      return <span>Access was <b className="text-amber-600">suspended</b> for this user.</span>;
    }
    if (log.action_type === 'REACTIVATE') {
      return <span>Access was <b className="text-emerald-600">restored</b> for this user.</span>;
    }
    if (log.action_type === 'REVOKE') {
      return <span>Permanently <b className="text-rose-600">deleted</b> user profile and system access.</span>;
    }

    // Generic fallback for future proofing
    return (
      <div className="text-[10px] space-y-1 font-mono bg-slate-100 p-2 rounded border border-slate-200">
        {log.old_values && Object.keys(log.old_values).length > 0 && <div><span className="text-slate-400 select-none">Old:</span> {JSON.stringify(log.old_values)}</div>}
        {log.new_values && Object.keys(log.new_values).length > 0 && <div><span className="text-slate-400 select-none">New:</span> {JSON.stringify(log.new_values)}</div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">System Audit Logs</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Track high-level administrative operations and security changes.</p>
          </div>

          <div className="card bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
            {/* Tabs */}
            <div className="flex px-6 pt-4 border-b border-slate-200 bg-slate-50/50 gap-6">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`pb-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${
                    activeTab === tab.id 
                      ? "border-blue-600 text-blue-600" 
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="overflow-x-auto min-h-[450px]">
              {activeTab !== 'STAFF' ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-12 h-12 mb-4 opacity-50 fill-current">
                    <path d="M21.71,15.58l-4.52-4.51a6.85,6.85,0,0,0,.14-1.4A7.67,7.67,0,0,0,6.42,2.72a1,1,0,0,0-.57.74,1,1,0,0,0,.28.88l4.35,4.34-1.8,1.8L4.34,6.13a1,1,0,0,0-.88-.27,1,1,0,0,0-.74.56,7.67,7.67,0,0,0,7,10.91,6.85,6.85,0,0,0,1.4-.14l4.51,4.52a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42l-4.9-4.9a1,1,0,0,0-.95-.26,5.88,5.88,0,0,1-1.48.2A5.67,5.67,0,0,1,4,9.67a6,6,0,0,1,.08-1L8,12.6a1,1,0,0,0,1.42,0L12.6,9.39A1,1,0,0,0,12.6,8L8.71,4.08a6.12,6.12,0,0,1,1-.08,5.67,5.67,0,0,1,5.66,5.67,5.88,5.88,0,0,1-.2,1.48,1,1,0,0,0,.26.95l4.9,4.9a1,1,0,0,0,1.42-1.42Z" />
                  </svg>
                  <p className="font-semibold text-sm">Logging for {tabs.find(t => t.id === activeTab)?.label} is currently under construction.</p>
                  <p className="text-xs mt-1">This functionality is under development and not currently accessible.</p>
                </div>
              ) : (
                <table className="table w-full">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="pl-6 py-4">Date / Time</th>
                      <th className="py-4">Performing Admin</th>
                      <th className="py-4">Action</th>
                      <th className="py-4">Target Record</th>
                      <th className="pr-6 py-4">Context Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                    {loading ? (
                      <tr><td colSpan="5" className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                    ) : logs.length === 0 ? (
                      <tr><td colSpan="5" className="text-center py-24 text-slate-400 font-medium">No actions have been logged yet.</td></tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="pl-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-slate-700">{new Date(log.timestamp).toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{new Date(log.timestamp).toLocaleTimeString()}</div>
                          </td>
                          <td className="py-4">
                            <div className="font-bold text-slate-800">{log.actor_name || 'System Auto'}</div>
                            <div className="text-[10px] text-slate-400 font-medium font-mono truncate max-w-[120px]" title={log.actor_id}>{log.actor_id?.split('-')[0]}***</div>
                          </td>
                          <td className="py-4 align-middle">
                            {getActionBadge(log.action_type)}
                          </td>
                          <td className="py-4 font-semibold text-slate-700">
                            {log.entity_name}
                          </td>
                          <td className="pr-6 py-4">
                            {renderDetails(log)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {activeTab === 'STAFF' && (
              <Pagination 
                totalCount={totalCount}
                itemsPerPage={ITEMS_PER_PAGE}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                loading={loading}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}