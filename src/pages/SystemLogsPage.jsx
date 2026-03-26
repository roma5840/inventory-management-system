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
    
    // Quick formatter for Staff roles
    if (log.action_type === 'CHANGE_ROLE') {
      return <span>Changed from <b>{log.old_values?.role?.replace('_', ' ')}</b> to <b>{log.new_values?.role?.replace('_', ' ')}</b></span>;
    }
    if (log.action_type === 'UPDATE_NAME') {
      return <span>Renamed from <b>{log.old_values?.full_name}</b> to <b>{log.new_values?.full_name}</b></span>;
    }
    if (log.action_type === 'INVITE') {
      return <span>Assigned as <b>{log.new_values?.role?.replace('_', ' ')}</b> ({log.new_values?.email})</span>;
    }

    // Generic fallback for future proofing
    return (
      <div className="text-[10px] space-y-1">
        {log.old_values && <div><span className="text-slate-400">Old:</span> {JSON.stringify(log.old_values)}</div>}
        {log.new_values && <div><span className="text-slate-400">New:</span> {JSON.stringify(log.new_values)}</div>}
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
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-4 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.492-3.396m-2.492 3.396l-3.396 2.492m3.396-2.492L8.32 8.32M15.17 11.42l-2.492 3.396m2.492-3.396L21 17.25m-5.83-5.83l-3.396-2.492m3.396 2.492L17.25 21" />
                  </svg>
                  <p className="font-semibold text-sm">Logging for {tabs.find(t => t.id === activeTab)?.label} is currently under construction.</p>
                  <p className="text-xs mt-1">Infrastructure is ready; active tracking will be enabled soon.</p>
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