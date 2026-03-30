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

  // Import Details Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedImportLog, setSelectedImportLog] = useState(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [importCreatedPage, setImportCreatedPage] = useState(1);
  const [importUpdatedPage, setImportUpdatedPage] = useState(1);
  const IMPORT_ITEMS_PER_PAGE = 20;

  const handleOpenImportModal = async (log) => {
      setIsFetchingMetadata(true); 
      
      const { data, error } = await supabase
          .from('audit_logs')
          .select('metadata')
          .eq('id', log.id)
          .single();

      if (!error && data && data.metadata) {
          setSelectedImportLog({ ...log, metadata: data.metadata });
          setImportCreatedPage(1); 
          setImportUpdatedPage(1); 
          setShowImportModal(true);
      } else {
          console.error("Failed to fetch import details", error);
      }
      setIsFetchingMetadata(false);
  };

  const tabs = [
    { id: 'STAFF', label: 'Staff Management' },
    { id: 'INVENTORY', label: 'Inventory Changes' },
    { id: 'STUDENTS', label: 'Student Imports' },
    { id: 'SUPPLIERS', label: 'Supplier Updates' }
  ];

  if (userRole !== 'SUPER_ADMIN') {
    return <div className="p-10 text-center text-error">Access Denied</div>;
  }

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // OMIT 'metadata' to prevent downloading megabytes of array data
      const { data, count, error } = await supabase
        .from('audit_logs')
        .select('id, timestamp, actor_id, actor_name, action_type, entity_type, entity_id, entity_name, old_values, new_values', { count: 'exact' })
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
      case 'CREATE': return <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Created</span>;
      case 'CREATE_COURSE': return <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">New Course</span>;
      case 'UPDATE': return <span className="text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Updated</span>;
      case 'DELETE': return <span className="text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Deleted</span>;
      case 'DELETE_COURSE': return <span className="text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Course Deleted</span>;
      case 'IMPORT': return <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Imported</span>;
      default: return <span className="text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">{actionType}</span>;
    }
  };

  const renderDetails = (log) => {
    if (!log.new_values && !log.old_values && !log.metadata) return <span className="text-slate-400 italic">No details captured</span>;
    
    // --- STAFF LOGS ---
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
      return <span>Access was suspended for this user.</span>;
    }
    if (log.action_type === 'REACTIVATE') {
      return <span>Access was restored for this user.</span>;
    }
    if (log.action_type === 'REVOKE') {
      return <span>Permanently deleted user profile and system access.</span>;
    }

    // --- INVENTORY & STUDENT LOGS ---
    if (log.action_type === 'CREATE') {
      return <span>Added new product <b className="text-slate-700">{log.entity_name}</b> ({log.new_values?.barcode})</span>;
    }
    if (log.action_type === 'CREATE_COURSE') {
      return <span>Registered new academic course {log.entity_name}</span>;
    }
    if (log.action_type === 'DELETE_COURSE') {
      return <span>Permanently removed course {log.entity_name}</span>;
    }
    if (log.action_type === 'UPDATE') {
      const changes = [];
      const isStudent = log.entity_type === 'STUDENTS';
      const labels = isStudent ? {
        name: 'Name', course: 'Course', year_level: 'Year Level'
      } : {
        name: 'Name', barcode: 'Barcode', accpac_code: 'AccPac Code',
        price: 'Price', cash_price: 'Cash Price', unit_cost: 'Unit Cost',
        min_stock_level: 'Min Stock Level', location: 'Location'
      };
      
      Object.keys(labels).forEach(key => {
        const oldVal = log.old_values?.[key];
        const newVal = log.new_values?.[key];
        
        if (newVal !== undefined && String(oldVal) !== String(newVal)) {
          changes.push(
            <li key={key}>
              Changed {labels[key]} from <b className="text-slate-500">{oldVal || 'None'}</b> to <b className="text-blue-600">{newVal || 'None'}</b>
            </li>
          );
        }
      });

      return (
        <div>
          {changes.length > 0 ? (
            <ul className="text-[11px] space-y-1 list-disc pl-4 text-slate-600 leading-tight">
              {changes}
            </ul>
          ) : (
            <span className="text-[10px] text-slate-400 italic">No specific field changes tracked.</span>
          )}
        </div>
      );
    }
    if (log.action_type === 'DELETE') {
      return <span>Deleted product <b className="text-slate-700">{log.entity_name}</b></span>;
    }
    if (log.action_type === 'IMPORT') {
      const hasUpdates = (log.new_values?.inserted > 0) || (log.new_values?.updated > 0);
      const isThisLogLoading = isFetchingMetadata && selectedImportLog?.id === log.id;

      return (
        <div className="flex flex-col items-start gap-2">
          <span>Processed batch import: <b className="text-emerald-600">{log.new_values?.inserted || 0} inserted</b>, <b className="text-blue-600">{log.new_values?.updated || 0} updated</b>, <b className="text-slate-500">{log.new_values?.unchanged || 0} unchanged</b></span>
          {hasUpdates && (
            <button 
                onClick={() => {
                    setSelectedImportLog(log); // Set reference immediately for the spinner
                    handleOpenImportModal(log);
                }}
                disabled={isFetchingMetadata}
                className="btn btn-xs bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded shadow-sm normal-case flex items-center gap-1 mt-1"
            >
                {isThisLogLoading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
                View Details
            </button>
          )}
        </div>
      );
    }

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
              {['SUPPLIERS'].includes(activeTab) ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 16 16" 
                    className="w-12 h-12 mb-4 opacity-50 fill-current"
                  >
                    <path 
                      fillRule="evenodd" 
                      clipRule="evenodd" 
                      d="M16,8 C16,12.4183 12.4183,16 8,16 C3.58172,16 0,12.4183 0,8 C0,3.58172 3.58172,0 8,0 C12.4183,0 16,3.58172 16,8 Z M9,5 C9,5.55228 8.55229,6 8,6 C7.44772,6 7,5.55228 7,5 C7,4.44772 7.44772,4 8,4 C8.55229,4 9,4.44772 9,5 Z M8,7 C7.44772,7 7,7.44772 7,8 L7,11 C7,11.5523 7.44772,12 8,12 C8.55229,12 9,11.5523 9,11 L9,8 C9,7.44772 8.55229,7 8,7 Z" 
                    />
                  </svg>
                  <p className="font-semibold text-sm">Logging for {tabs.find(t => t.id === activeTab)?.label} is Not Available</p>
                  <p className="text-xs mt-1">This feature is planned for future enhancement and is not included in the current release.</p>
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

            {['STAFF', 'INVENTORY', 'STUDENTS'].includes(activeTab) && (
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

      {/* Import Details Modal */}
      {showImportModal && selectedImportLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowImportModal(false)} 
          />
          
          <div className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-xl text-slate-900">Import Batch Details</h3>
                    </div>
                    <p className="text-sm text-slate-500 font-medium">Breakdown of items created and updated during this batch</p>
                </div>
                <button 
                    onClick={() => setShowImportModal(false)} 
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
                {/* Inserted Items */}
                {selectedImportLog.metadata?.insertedItems?.length > 0 && (() => {
                    const createdItems = selectedImportLog.metadata.insertedItems;
                    const paginatedCreated = createdItems.slice((importCreatedPage - 1) * IMPORT_ITEMS_PER_PAGE, importCreatedPage * IMPORT_ITEMS_PER_PAGE);
                    const isStudent = selectedImportLog.entity_type === 'STUDENTS';
                    
                    return (
                        <div>
                            <h4 className="text-md font-bold text-emerald-700 mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                                Created Items ({createdItems.length})
                            </h4>
                            <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                                <table className="table table-sm w-full border-separate border-spacing-0">
                                    <thead className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500">
                                        <tr>
                                            <th className="py-3 pl-4">{isStudent ? 'Student ID' : 'Barcode'}</th>
                                            <th className="py-3">{isStudent ? 'Name' : 'Product Name'}</th>
                                            <th className="py-3">{isStudent ? 'Course' : 'Unit Cost'}</th>
                                            <th className="py-3">{isStudent ? 'Year Level' : 'Price'}</th>
                                            {!isStudent && <th className="py-3">Cash Price</th>}
                                            {!isStudent && <th className="py-3 pr-4 text-center">Initial Stock</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {paginatedCreated.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-emerald-50/30 transition-colors group">
                                                <td className="pl-4 py-3">
                                                    <code className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-600 group-hover:bg-white transition-colors uppercase tracking-tighter">
                                                        {isStudent ? item.student_id : item.barcode}
                                                    </code>
                                                </td>
                                                <td className="py-3 font-semibold text-sm text-slate-800">{item.name}</td>
                                                {isStudent ? (
                                                    <>
                                                        <td className="py-3 text-slate-500 text-xs font-medium">{item.course || '—'}</td>
                                                        <td className="py-3 text-slate-600 text-xs font-mono">{item.year_level || '—'}</td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="py-3 text-slate-500 text-xs font-mono">₱{Number(item.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                        <td className="py-3 text-slate-600 text-xs font-mono">₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                        <td className="py-3 text-emerald-600 text-xs font-mono font-medium">₱{Number(item.cash_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                        <td className="py-3 pr-4 text-center font-bold text-slate-700">{item.current_stock}</td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {createdItems.length > IMPORT_ITEMS_PER_PAGE && (
                                    <Pagination 
                                        totalCount={createdItems.length}
                                        itemsPerPage={IMPORT_ITEMS_PER_PAGE}
                                        currentPage={importCreatedPage}
                                        onPageChange={setImportCreatedPage}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Updated Items */}
                {selectedImportLog.metadata?.updatedItems?.length > 0 && (() => {
                    const updatedItems = selectedImportLog.metadata.updatedItems;
                    const paginatedUpdated = updatedItems.slice((importUpdatedPage - 1) * IMPORT_ITEMS_PER_PAGE, importUpdatedPage * IMPORT_ITEMS_PER_PAGE);
                    const isStudent = selectedImportLog.entity_type === 'STUDENTS';
                    
                    return (
                        <div>
                            <h4 className="text-md font-bold text-blue-700 mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                Updated Items ({updatedItems.length})
                            </h4>
                            <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                                <table className="table table-sm w-full border-separate border-spacing-0">
                                    <thead className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500">
                                        <tr>
                                            <th className="py-3 pl-4 w-[140px]">{isStudent ? 'Student ID' : 'Barcode'}</th>
                                            <th className="py-3 w-1/3">{isStudent ? 'Name' : 'Product Name'}</th>
                                            <th className="py-3 pr-4">Specific Changes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {paginatedUpdated.map((itemPair, idx) => {
                                            const { old: o, new: n } = itemPair;
                                            const labels = isStudent ? {
                                                name: 'Name', course: 'Course', year_level: 'Year Level'
                                            } : {
                                                name: 'Name', barcode: 'Barcode', accpac_code: 'AccPac Code',
                                                price: 'Price', cash_price: 'Cash Price', unit_cost: 'Unit Cost',
                                                min_stock_level: 'Min Stock Level', location: 'Location'
                                            };
                                            const changes = [];
                                            Object.keys(labels).forEach(key => {
                                                if (n[key] !== undefined && String(o[key]) !== String(n[key])) {
                                                    changes.push(
                                                        <li key={key}>
                                                            Changed {labels[key]} from <b className="text-slate-500">{o[key] || 'None'}</b> to <b className="text-blue-600">{n[key] || 'None'}</b>
                                                        </li>
                                                    );
                                                }
                                            });

                                            return (
                                                <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                                    <td className="pl-4 py-3 align-top">
                                                        <code className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-600 uppercase tracking-tighter whitespace-nowrap">
                                                            {isStudent ? (n.student_id || o.student_id) : (n.barcode || o.barcode)}
                                                        </code>
                                                    </td>
                                                    <td className="py-3 font-semibold text-sm text-slate-800 align-top leading-tight pr-4">
                                                        {o.name}
                                                    </td>
                                                    <td className="py-3 pr-4 align-top">
                                                        <ul className="text-xs space-y-1.5 list-disc pl-4 text-slate-600 leading-tight">
                                                            {changes.length > 0 ? changes : <span className="italic text-slate-400">Merged (No modified fields tracked)</span>}
                                                        </ul>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {updatedItems.length > IMPORT_ITEMS_PER_PAGE && (
                                    <Pagination 
                                        totalCount={updatedItems.length}
                                        itemsPerPage={IMPORT_ITEMS_PER_PAGE}
                                        currentPage={importUpdatedPage}
                                        onPageChange={setImportUpdatedPage}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}