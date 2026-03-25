import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import * as XLSX from 'xlsx';
import Pagination from "./Pagination";

export default function TransactionsManager() {
  const { userRole } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFilter, setDateFilter] = useState("7DAYS"); 
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL"); 
  const [searchRef, setSearchRef] = useState(""); // Debounced value used for fetching
  const [localSearch, setLocalSearch] = useState(""); // Immediate value for input

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 10;

  const [expandedRows, setExpandedRows] = useState(new Set());
  const toggleRow = (refNo) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(refNo)) next.delete(refNo);
      else next.add(refNo);
      return next;
    });
  };
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Debounce Search Effect
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== searchRef) {
        setSearchRef(localSearch);
        setCurrentPage(1); // Reset page only when search actually updates
      }
    }, 400); // Wait 400ms after typing stops

    return () => clearTimeout(handler);
  }, [localSearch, searchRef]);

  // Fetch transactions when dependencies change
  useEffect(() => {
    const fetchOptions = { ignore: false };
    fetchTransactions(fetchOptions);
    return () => { fetchOptions.ignore = true; };
  }, [currentPage, dateFilter, typeFilter, modeFilter, searchRef]);

  // Helper to build the base query based on filters
  const buildQuery = (tableName = 'vw_transaction_headers', selectFields = '*') => {
    // Add exact count calculation natively
    let query = supabase
        .from(tableName)
        .select(selectFields, { count: 'exact' })
        .order('timestamp', { ascending: false });

    // 1. Date Filter
    const now = new Date();
    if (dateFilter === "TODAY") {
        const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();
        query = query.gte('timestamp', startOfDay);
    } else if (dateFilter === "7DAYS") {
        const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
        query = query.gte('timestamp', sevenDaysAgo);
    } else if (dateFilter === "30DAYS") {
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).toISOString();
        query = query.gte('timestamp', thirtyDaysAgo);
    }

    // 2. Type Filter
    if (typeFilter !== "ALL") query = query.eq('type', typeFilter);

    // 3. Mode Filter
    if (modeFilter !== "ALL") query = query.eq('transaction_mode', modeFilter);

    // 4. Search Filter
    if (searchRef) {
        const safeRef = searchRef.replace(/,/g, '_');
        query = query.or(`student_name.ilike.%${safeRef}%,student_id.ilike.%${safeRef}%,supplier.ilike.%${safeRef}%,department.ilike.%${safeRef}%`);
    }

    return query;
  };

  const fetchTransactions = async (options = { ignore: false }) => {
    setLoading(true);
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Step 1: Ask Postgres to give us exactly 10 matching groups
      const { data: headerData, count, error: headerError } = await buildQuery('vw_transaction_headers', '*')
        .range(from, to);
      
      if (options.ignore) return; // Prevent race conditions

      if (headerError) throw headerError;
      setTotalCount(count || 0);

      if (!headerData || headerData.length === 0) {
          setTransactions([]);
          setLoading(false);
          return;
      }

      // Step 2: Fetch full line items strictly for those 10 references
      const pageRefs = headerData.map(h => h.reference_number);
      const { data: txData, error: txError } = await supabase
          .from('vw_transaction_history')
          .select('*')
          .in('reference_number', pageRefs)
          .order('timestamp', { ascending: false });

      if (options.ignore) return; // Prevent race conditions after second await

      if (txError) throw txError;

      let cleanedData = txData || [];
      if (typeFilter === 'ALL') {
         cleanedData = cleanedData.filter(row => {
            if (!row.is_voided) return true; 
            if (row.type === 'VOID') return true; 
            return txData.some(r => r.reference_number === row.reference_number && r.type === 'VOID');
         });
      }

      setTransactions(cleanedData);

    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      if (!options.ignore) setLoading(false);
    }
  };

  // Grouping Logic
  const groupedTransactions = transactions.reduce((acc, curr) => {
    const key = curr.reference_number || "NO_REF";
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {});

  const handleExport = async () => {
    if (totalCount > 5000) {
        if(!window.confirm(`You are about to export ${totalCount} groups. This might take a moment. Continue?`)) return;
    }
    
    setIsExporting(true);
    try {
        // Explicitly query the full history view for Excel exports
        const { data: rawData, error } = await buildQuery('vw_transaction_history', '*').limit(100000);
        if (error) throw error;

        const voidRefs = [...new Set(rawData.filter(t => t.type === 'VOID').map(t => t.reference_number).filter(Boolean))];
        let voidOriginalTypeMap = {};
        
        if (voidRefs.length > 0) {
            voidRefs.forEach(ref => {
                const orig = rawData.find(t => t.reference_number === ref && t.type !== 'VOID');
                if (orig) voidOriginalTypeMap[ref] = orig.type;
            });

            const missingRefs = voidRefs.filter(ref => !voidOriginalTypeMap[ref]);
            if (missingRefs.length > 0) {
                const { data: missingOrigs } = await supabase
                    .from('vw_transaction_history')
                    .select('reference_number, type')
                    .in('reference_number', missingRefs)
                    .neq('type', 'VOID');
                
                missingOrigs?.forEach(o => {
                    voidOriginalTypeMap[o.reference_number] = o.type;
                });
            }
        }

        const excelRows = rawData.map(item => {
            const dateObj = new Date(item.timestamp);
            const isVoid = item.type === 'VOID';
            
            let actualType = item.type;
            if (isVoid) {
                actualType = item.original_type || voidOriginalTypeMap[item.reference_number] || 'VOID';
            }
            
            const isCostType = ['RECEIVING', 'PULL_OUT'].includes(actualType);
            const isCashMode = item.transaction_mode === 'CASH';
            const unitValue = isCostType ? (item.unit_cost_snapshot ?? 0) : isCashMode ? (item.cash_price_snapshot ?? 0) : (item.price_snapshot ?? item.price);
            const totalValue = unitValue * item.qty;
            const valType = isCostType ? "UNIT COST" : isCashMode ? "CASH PRICE" : "UNIT PRICE";

            const bisColumnValue = isVoid ? (item.original_bis || "---") : (item.bis_number || "---");
            const linkedColumnValue = isVoid ? "" : (item.original_bis || "");

            return {
                "Type": item.type,
                "BIS #": bisColumnValue,
                "Transmittal No": item.transmittal_no || "",
                "Transac Mode": item.transaction_mode || "N/A",
                "Date Encoded": dateObj.toLocaleDateString(),
                "Time Encoded": dateObj.toLocaleTimeString(),
                "Month": dateObj.toLocaleString('default', { month: 'long' }),
                "Encoder": item.staff_name,
                "Ref #": item.reference_number,
                "Linked BIS #": linkedColumnValue,
                "Student ID": item.student_id || "",
                "Student Name": item.student_name || "",
                "Year Level": item.year_level || "",
                "Course": item.course || "",
                "Department": item.department || "",
                "Requested By": item.requested_by || "",
                "Released By": item.released_by || "",
                "Charge To": item.charge_to || "",
                "Purpose": item.purpose || "",
                "Supplier": item.supplier || "",
                "Accpac Item Code": item.accpac_code_snapshot,
                "Item Name": item.product_name_snapshot || item.product_name,
                "Qty": item.qty,
                "Valuation Type": valType,
                "Unit Value": unitValue,
                "Total Amount": totalValue,
                "Remarks": (isVoid && item.void_reason) ? item.void_reason : (item.remarks || ""),
                "Void Status": item.is_voided ? "VOIDED" : "Active"
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
        const fname = `TransHistory_${typeFilter}_${dateFilter}_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(workbook, fname);
    } catch (err) {
        console.error("Export failed:", err);
        alert("Failed to export data.");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="card bg-white shadow-lg border border-gray-200">
      <div className="card-body p-0">
        
        {/* HEADER & FILTERS */}
        <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row justify-between items-center bg-white rounded-t-xl gap-4">
          <div className="flex flex-col lg:flex-row items-center gap-6 w-full xl:w-auto">
            <div className="text-center lg:text-left">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">TRANSACTION LEDGER</h2>
            </div>

            {/* Filter Controls Group */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                
                {/* Date Segmented Pill */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    {[
                        { label: 'Today', val: 'TODAY' },
                        { label: '7 Days', val: '7DAYS' },
                        { label: '30 Days', val: '30DAYS' },
                        { label: 'All', val: 'ALL' }
                    ].map(opt => (
                        <button 
                            key={opt.val}
                            onClick={() => { setDateFilter(opt.val); setCurrentPage(1); }}
                            className={`px-3 py-1 text-[11px] uppercase tracking-widest font-bold rounded-md transition-all ${dateFilter === opt.val ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Dropdowns */}
                <select 
                  className="select select-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-xs font-semibold text-slate-600 rounded-lg h-8" 
                  value={typeFilter} 
                  onChange={e => { setTypeFilter(e.target.value); setModeFilter("ALL"); setCurrentPage(1); }}
                >
                    <option value="ALL">All Types</option>
                    <option value="ISSUANCE">Issuance</option>
                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <option value="RECEIVING">Receiving</option>}
                    <option value="ISSUANCE_RETURN">Return</option>
                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <option value="PULL_OUT">Pull Out</option>}
                </select>

                {(typeFilter === "ALL" || typeFilter === "ISSUANCE") && (
                     <select 
                      className="select select-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-xs font-semibold text-slate-600 rounded-lg h-8" 
                      value={modeFilter} 
                      onChange={e => { setModeFilter(e.target.value); setCurrentPage(1); }}
                    >
                        <option value="ALL">All Modes</option>
                        <option value="CASH">Cash</option>
                        <option value="CHARGED">Charged</option>
                        <option value="SIP">SIP</option>
                        {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                            <option value="TRANSMITTAL">Transmittal</option>
                        )}
                    </select>
                )}
            </div>
          </div>

          {/* Right Side Controls */}
          <div className="flex items-center gap-3 w-full xl:w-auto">
              <div className="relative flex-1 md:w-64">
                 <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                 </div>
                 <input 
                  type="text" 
                  placeholder="Search Name, No, Supplier..." 
                  className="input input-sm w-full pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all text-xs rounded-lg h-8"
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                />
              </div>

              {userRole === 'SUPER_ADMIN' && (
                  <button 
                      onClick={handleExport} 
                      disabled={isExporting || totalCount === 0}
                      className="btn btn-sm bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-lg px-4 gap-2 h-8"
                  >
                      {isExporting ? (
                          <span className="loading loading-spinner loading-xs"></span>
                      ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                      )}
                      <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline">Export</span>
                  </button>
              )}
          </div>
        </div>

        {/* DETAILED TABLE */}
        <div className="overflow-x-auto min-h-[500px]">
            <table className="table w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                    <th className="bg-slate-50/80 py-4 pl-6 w-[15%]">Type / Mode</th>
                    <th className="bg-slate-50/80 py-4 w-[15%]">BIS #</th>
                    <th className="bg-slate-50/80 py-4 w-[15%]">Date</th>
                    <th className="bg-slate-50/80 py-4 w-[25%]">Entity</th>
                    <th className="bg-slate-50/80 py-4 w-[15%]">Items</th>
                    <th className="bg-slate-50/80 py-4 pr-6 text-right w-[15%]">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan="6" className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                ) : Object.keys(groupedTransactions).length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-16 text-slate-400 font-medium uppercase tracking-widest text-xs">No transactions found matching filters.</td></tr>
                ) : (
                    Object.entries(groupedTransactions).map(([refNo, items]) => {
                        const nonVoidItems = items.filter(i => i.type !== 'VOID');
                        const voidRow = items.find(i => i.type === 'VOID'); 
                        const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                        const first = nonVoidItems.length > 0 ? nonVoidItems[0] : items[0];
                        
                        const isVoided = items.some(i => i.is_voided) || !!voidRow;
                        const isOrphanVoid = items.every(i => i.type === 'VOID');
                        const isCostType = ['RECEIVING', 'PULL_OUT'].includes(first.type);
                        const isCashMode = first.transaction_mode === 'CASH';
                        const isExpanded = expandedRows.has(refNo);

                        const totalValue = displayItems.reduce((sum, item) => {
                            const val = isCostType ? (item.unit_cost_snapshot ?? 0) : isCashMode ? (item.cash_price_snapshot ?? 0) : (item.price_snapshot ?? item.price);
                            return sum + (val * item.qty);
                        }, 0);

                        const voidSource = voidRow || (isOrphanVoid ? first : null);

                        let entityName = "Unknown Entity";
                        if (first.transaction_mode === 'TRANSMITTAL') entityName = `Dept: ${first.department}`;
                        else if (first.student_name) entityName = first.student_name;
                        else if (first.supplier) entityName = first.supplier;
                        else if (isOrphanVoid) entityName = "System Reversal";

                        return (
                            <>
                            <tr 
                                key={`row-${refNo}`} 
                                onClick={() => toggleRow(refNo)}
                                className={`cursor-pointer transition-colors hover:bg-slate-50/70 group ${isExpanded ? 'bg-slate-50/50' : ''} ${isVoided ? 'bg-red-50/30 hover:bg-red-50/50' : ''}`}
                            >
                                <td className={`pl-6 relative ${isVoided ? 'border-l-4 border-l-red-400' : ''}`}>
                                    <div className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest leading-none
                                        ${isOrphanVoid ? 'bg-amber-600 text-white' : 
                                        first.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-800' : 
                                        first.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-800' : 
                                        first.type === 'ISSUANCE_RETURN' ? 'bg-sky-100 text-sky-800' :
                                        first.type === 'PULL_OUT' ? 'bg-amber-100 text-amber-800' : 
                                        'bg-slate-100 text-slate-800'}`}>
                                        {isOrphanVoid ? 'TRANSACTION' : first.type.replace('_', ' ')}
                                    </div>
                                    {first.transaction_mode && !isOrphanVoid && (
                                        <div className="mt-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                                            {first.transaction_mode}
                                        </div>
                                    )}
                                </td>

                                <td>
                                    <div className={`font-mono text-lg font-bold tracking-tight ${isVoided ? 'text-red-900 line-through decoration-red-300' : 'text-slate-800'}`}>
                                        #{first.bis_number || "---"}
                                    </div>
                                </td>

                                <td>
                                    <div className="text-xs font-semibold text-slate-700">{new Date(first.timestamp).toLocaleDateString()}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{new Date(first.timestamp).toLocaleTimeString()}</div>
                                </td>

                                <td>
                                    <div className="text-sm font-semibold text-slate-800 truncate max-w-[200px] xl:max-w-[300px]" title={entityName}>{entityName}</div>
                                    {first.student_id && (
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                            <span className="font-mono">{first.student_id}</span>
                                        </div>
                                    )}
                                </td>

                                <td>
                                    <div className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                        {displayItems.length} {displayItems.length === 1 ? 'item' : 'items'}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 group-hover:text-indigo-500 transition-colors flex items-center gap-1">
                                        Click to view <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                                    </div>
                                </td>

                                <td className="pr-6 text-right">
                                    <div className="font-mono text-base font-bold text-slate-800">
                                        {first.type === 'ISSUANCE_RETURN' ? '-' : ''}₱{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{isCostType ? 'Cost Val' : isCashMode ? 'Cash Val' : 'SRP Val'}</div>
                                </td>
                            </tr>

                            {/* Expanded Details Row */}
                            {isExpanded && (
                                <tr key={`exp-${refNo}`} className="bg-slate-50/50 border-b border-slate-200 shadow-inner">
                                    <td colSpan="6" className="p-0">
                                        <div className="px-6 py-5 border-l-4 border-indigo-200">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                                
                                                {/* Left: Metadata & Context */}
                                                <div className="space-y-4">
                                                    <div>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">System Reference</span>
                                                        <span className="font-mono text-xs text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded">{refNo}</span>
                                                    </div>
                                                    
                                                    <div>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Encoded By</span>
                                                        <span className="text-xs font-bold text-slate-700">{first.staff_name}</span>
                                                    </div>

                                                    {first.transaction_mode === 'TRANSMITTAL' && (
                                                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-1.5">Transmittal Info</span>
                                                            <div className="space-y-1 text-xs text-slate-600">
                                                                {first.transmittal_no && <div><span className="font-bold text-slate-400">TR #:</span> <span className="font-mono">{first.transmittal_no}</span></div>}
                                                                {first.requested_by && <div><span className="font-bold text-slate-400">Req:</span> {first.requested_by}</div>}
                                                                {first.released_by && <div><span className="font-bold text-slate-400">Rel:</span> {first.released_by}</div>}
                                                                {first.charge_to && <div><span className="font-bold text-slate-400">Charge:</span> {first.charge_to}</div>}
                                                                {first.purpose && <div className="italic text-slate-500 mt-1">"{first.purpose}"</div>}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Standard Entity / Released By Info (Non-Transmittal) */}
                                                    {first.transaction_mode !== 'TRANSMITTAL' && (first.student_name || first.supplier || first.released_by) && (
                                                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                                                {first.student_name ? 'Student Info' : first.supplier ? 'Supplier Info' : 'Details'}
                                                            </span>
                                                            <div className="space-y-1 text-xs text-slate-600">
                                                                {first.student_name && (
                                                                    <>
                                                                        <div className="font-semibold text-slate-700">{first.student_name}</div>
                                                                        {first.student_id && <div><span className="font-bold text-slate-400">ID:</span> <span className="font-mono">{first.student_id}</span></div>}
                                                                        {first.course && <div><span className="font-bold text-slate-400">Course:</span> {first.course}</div>}
                                                                        {first.year_level && <div><span className="font-bold text-slate-400">Year Level:</span> {first.year_level}</div>}
                                                                    </>
                                                                )}
                                                                
                                                                {first.supplier && (
                                                                    <div className="font-semibold text-slate-700">{first.supplier}</div>
                                                                )}

                                                                {first.released_by && (
                                                                    <div className={`pt-1.5 ${first.student_name || first.supplier ? 'mt-1.5 border-t border-slate-100' : ''}`}>
                                                                        <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mr-1">Rel:</span> {first.released_by}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {first.type === 'ISSUANCE_RETURN' && first.original_bis && (
                                                        <div>
                                                            <span className="text-[10px] font-black text-sky-500 uppercase tracking-widest block mb-1">Linked Issuance</span>
                                                            <span className="font-mono font-bold text-sm text-sky-700">#{first.original_bis}</span>
                                                        </div>
                                                    )}

                                                    {first.remarks && !isOrphanVoid && (
                                                        <div className="bg-amber-50 border border-amber-100 p-2.5 rounded text-amber-800 text-xs">
                                                            <span className="font-bold uppercase tracking-widest text-[9px] block mb-0.5">Remarks</span>
                                                            <span className="italic">"{first.remarks}"</span>
                                                        </div>
                                                    )}

                                                    {isVoided && voidSource && (
                                                        <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                                                            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest block mb-1.5">Void Details</span>
                                                            <div className="text-xs text-red-900 font-medium mb-1">Reason: <span className="italic font-normal">"{voidSource.void_reason || first.void_reason || "N/A"}"</span></div>
                                                            <div className="text-[10px] text-red-700 uppercase tracking-widest font-bold mt-2">
                                                                Voided by {voidSource.staff_name || "Unknown"} <span className="text-red-400 font-normal ml-1">({new Date(voidSource.timestamp).toLocaleString()})</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Right: Item Breakdown (takes 2 cols) */}
                                                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 border-b border-slate-100 pb-2">Item Details</span>
                                                    <div className="space-y-2">
                                                        {displayItems.map(item => {
                                                            const itemIsCashMode = item.transaction_mode === 'CASH';
                                                            const itemVal = isCostType ? (item.unit_cost_snapshot ?? 0) : itemIsCashMode ? (item.cash_price_snapshot ?? 0) : (item.price_snapshot ?? item.price);
                                                            return (
                                                                <div key={item.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                                                                    <div className="flex-1">
                                                                        <div className="font-semibold text-slate-800">{item.product_name_snapshot || "Item"}</div>
                                                                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.barcode_snapshot || item.product_id}</div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="font-mono text-slate-600">
                                                                            {item.qty} <span className="text-slate-300 px-1">×</span> {Number(itemVal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                        </div>
                                                                        <div className="font-mono font-bold text-slate-800 mt-0.5">
                                                                            ₱{(item.qty * itemVal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            </>
                        );
                    })
                )}
                </tbody>
            </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-200">
            <Pagination 
                totalCount={totalCount}
                itemsPerPage={ITEMS_PER_PAGE}
                currentPage={currentPage}
                onPageChange={(p) => setCurrentPage(p)}
                loading={loading}
            />
        </div>
      </div>
    </div>
  );
}