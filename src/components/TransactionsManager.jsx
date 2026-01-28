import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import * as XLSX from 'xlsx';

export default function TransactionsManager() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFilter, setDateFilter] = useState("7DAYS"); 
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL"); 
  const [searchRef, setSearchRef] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [jumpPage, setJumpPage] = useState(1); // For the manual input
  const ITEMS_PER_PAGE = 10;
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setJumpPage(1);
  }, [dateFilter, typeFilter, modeFilter, searchRef]);

  useEffect(() => {
    fetchTransactions();
  }, [page, dateFilter, typeFilter, modeFilter, searchRef]); // Re-fetch on page change

  // Helper to build the base query based on filters
  const buildQuery = (isForExport = false) => {
    let query = supabase
        .from('transactions')
        .select('*', { count: isForExport ? 'exact' : 'exact' }) // Always get count
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

    // 4. Search Filter (Server-side for pagination efficiency)
    if (searchRef) {
        // Note: OR syntax in Supabase for text search
        query = query.or(`reference_number.ilike.%${searchRef}%,student_name.ilike.%${searchRef}%`);
    }

    return query;
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      let query = buildQuery(false);

      // Pagination Range
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data: txData, count, error } = await query;
      if (error) throw error;

      // --- ORPHAN VOID FIX START ---
      // If we have a VOID row but pagination/filters hid the original, fetch it now.
      let combinedData = [...(txData || [])];
      
      const distinctRefs = [...new Set(combinedData.map(t => t.reference_number).filter(Boolean))];
      const orphanRefs = [];

      distinctRefs.forEach(ref => {
          const items = combinedData.filter(t => t.reference_number === ref);
          const hasOriginal = items.some(t => t.type !== 'VOID');
          if (!hasOriginal) orphanRefs.push(ref);
      });

      if (orphanRefs.length > 0) {
          const { data: originals } = await supabase
              .from('transactions')
              .select('*')
              .in('reference_number', orphanRefs)
              .neq('type', 'VOID'); // Fetch the original context
          
          if (originals?.length > 0) {
              combinedData = [...combinedData, ...originals];
          }
      }
      // --- ORPHAN VOID FIX END ---

      // Fetch Staff Names
      const enriched = await enrichWithStaffNames(combinedData);

      setTransactions(enriched);
      setTotalCount(count || 0);

    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const enrichWithStaffNames = async (data) => {
      if (!data || data.length === 0) return [];
      const userIds = [...new Set(data.map(t => t.user_id).filter(Boolean))];
      let userMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('authorized_users')
          .select('auth_uid, full_name, email')
          .in('auth_uid', userIds); 
        users?.forEach(u => userMap[u.auth_uid] = u.full_name || u.email);
      }
      return data.map(t => ({
        ...t,
        staff_name: userMap[t.user_id] || 'Unknown'
      }));
  };

  // Grouping Logic
  const groupedTransactions = transactions.reduce((acc, curr) => {
    // Search Filter applied post-fetch for client-side responsiveness
    if (searchRef && !curr.reference_number.toLowerCase().includes(searchRef.toLowerCase()) && 
        !curr.student_name?.toLowerCase().includes(searchRef.toLowerCase())) {
        return acc;
    }

    const key = curr.reference_number || "NO_REF";
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {});

  const handleExport = async () => {
    if (totalCount > 5000) {
        if(!window.confirm(`You are about to export ${totalCount} rows. This might take a moment. Continue?`)) return;
    }
    
    setIsExporting(true);
    try {
        // 1. Fetch ALL data matching filters (No pagination range)
        const { data: rawData, error } = await buildQuery(true);
        if (error) throw error;

        // 2. Enrich with Staff Names
        const fullData = await enrichWithStaffNames(rawData);

        // 3. Map to Excel Structure
        const excelRows = fullData.map(item => {
            const dateObj = new Date(item.timestamp);
            
            // Base Object (Common Fields)
            const row = {
                "Type": item.type,
                "Transac Mode": item.transaction_mode || "N/A",
                "Date Encoded": dateObj.toLocaleDateString(),
                "Time Encoded": dateObj.toLocaleTimeString(),
                "Month": dateObj.toLocaleString('default', { month: 'long' }),
                "Encoder": item.staff_name,
                "Ref #": item.reference_number,
                
                // Student Fields
                "Student ID": item.student_id || "",
                "Student Name": item.student_name || "",
                "Year Level": item.year_level || "",
                "Course": item.course || "",
                
                // Supplier Fields (For Receiving/PullOut)
                "Supplier": item.supplier || "",

                // Item Fields
                "Accpac Item Code": item.accpac_code_snapshot,
                "Item Name": item.product_name_snapshot || item.product_name,
                "Qty": item.qty,
                "Unit Price": item.price_snapshot ?? item.price,
                "Total Amount": (item.price_snapshot ?? item.price) * item.qty,
                "Remarks": item.remarks || "",
                "Void Status": item.is_voided ? "VOIDED" : "Active"
            };

            return row;
        });

        // 4. Generate Excel
        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
        
        // Dynamic Filename
        const fname = `TransHistory_${typeFilter}_${dateFilter}_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(workbook, fname);

    } catch (err) {
        console.error("Export failed:", err);
        alert("Failed to export data. See console.");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="card bg-white shadow-lg border border-gray-200">
      <div className="card-body p-6">
        
        {/* HEADER & FILTERS */}
        <div className="flex flex-col gap-4 mb-6 border-b pb-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">Transaction Ledger</h2>
                <p className="text-sm text-gray-500">View and audit all inventory movements</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
                {/* Date Filter */}
                <select className="select select-sm select-bordered" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                    <option value="TODAY">Today</option>
                    <option value="7DAYS">Last 7 Days</option>
                    <option value="30DAYS">Last 30 Days</option>
                    <option value="ALL">All Time</option>
                </select>

                {/* Type Filter */}
                <select className="select select-sm select-bordered" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setModeFilter("ALL"); }}>
                    <option value="ALL">All Types</option>
                    <option value="ISSUANCE">Issuance</option>
                    <option value="RECEIVING">Receiving</option>
                    <option value="ISSUANCE_RETURN">Return</option>
                    <option value="PULL_OUT">Pull Out</option>
                </select>

                {/* Mode Filter */}
                {(typeFilter === "ALL" || typeFilter === "ISSUANCE") && (
                     <select className="select select-sm select-bordered" value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
                        <option value="ALL">All Modes</option>
                        <option value="CASH">Cash</option>
                        <option value="CHARGED">Charged</option>
                        <option value="SIP">SIP</option>
                        <option value="TRANSMITTAL">Transmittal</option>
                    </select>
                )}

                {/* Export Button - Placed immediately after filters */}
                <button 
                    onClick={handleExport} 
                    disabled={isExporting || totalCount === 0}
                    className="btn btn-sm btn-outline btn-success gap-2"
                    title="Download as Excel"
                >
                    {isExporting ? (
                        <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                    )}
                    Export
                </button>
                
                {/* Search - Pushed to the right on larger screens */}
                <input 
                    type="text" 
                    placeholder="Search Ref or Student..." 
                    className="input input-sm input-bordered w-full sm:w-64 sm:ml-auto"
                    value={searchRef}
                    onChange={e => setSearchRef(e.target.value)}
                />
            </div>
        </div>

        {/* DETAILED TABLE */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="table w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-32">Date / Ref</th>
                <th className="w-24">Type</th>
                <th className="w-48">Entity (Student/Supp)</th>
                <th>Items Breakdown</th>
                <th className="text-right w-24">Total Value</th>
                <th className="w-32 text-right">Staff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                  <tr><td colSpan="6" className="text-center py-10">Loading records...</td></tr>
              ) : Object.keys(groupedTransactions).length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-10 text-gray-400">No transactions found matching filters.</td></tr>
              ) : (
                  Object.entries(groupedTransactions).map(([refNo, items]) => {
                      // 1. Determine "Original" vs "Void" rows
                      const nonVoidItems = items.filter(i => i.type !== 'VOID');
                      const voidRow = items.find(i => i.type === 'VOID'); 
                      
                      // 2. Select data to display (Handle orphans where original is on another page)
                      const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                      const first = nonVoidItems.length > 0 ? nonVoidItems[0] : items[0];
                      
                      const isVoided = items.some(i => i.is_voided) || !!voidRow;
                      const isOrphanVoid = items.every(i => i.type === 'VOID');

                      // 3. Calculate Total Value (Use displayItems to ensure orphans still show value)
                      const totalValue = displayItems.reduce((sum, item) => {
                          const price = item.price_snapshot !== null ? item.price_snapshot : item.price;
                          return sum + (price * item.qty);
                      }, 0);

                      // 4. Void Metadata source
                      // If we have a dedicated voidRow, use it. If we are an orphan void, 'first' IS the void row.
                      const voidSource = voidRow || (isOrphanVoid ? first : null);

                      return (
                          <tr key={refNo} className={`border-b hover:bg-gray-50 align-top ${isVoided ? 'opacity-50 grayscale bg-gray-50' : ''}`}>
                              {/* 1. Ref & Date */}
                              <td className="py-2">
                                  <div className="font-mono font-bold text-xs">{refNo}</div>
                                  <div className="text-[10px] text-gray-500">{new Date(first.timestamp).toLocaleDateString()}</div>
                                  <div className="text-[10px] text-gray-400">{new Date(first.timestamp).toLocaleTimeString()}</div>
                                  {isVoided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                              </td>

                              {/* 2. Type & Mode */}
                              <td className="py-2">
                                  {isOrphanVoid ? (
                                    <div className="badge badge-sm font-bold border-0 bg-gray-200 text-gray-800">
                                        TRANSACTION
                                    </div>
                                  ) : (
                                    <div className={`badge badge-sm font-bold border-0 
                                        ${first.type === 'RECEIVING' ? 'bg-green-100 text-green-800' : 
                                            first.type === 'ISSUANCE' ? 'bg-blue-100 text-blue-800' : 
                                            first.type === 'ISSUANCE_RETURN' ? 'bg-indigo-100 text-indigo-800' :
                                            first.type === 'PULL_OUT' ? 'bg-orange-100 text-orange-800' : 
                                            'bg-gray-200 text-gray-800'}`}>
                                        {first.type.replace('_', ' ')}
                                    </div>
                                  )}
                                  
                                  {first.transaction_mode && (
                                      <div className="mt-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                          {first.transaction_mode}
                                      </div>
                                  )}
                              </td>

                              {/* 3. Entity */}
                              <td className="py-2">
                                  {first.student_name ? (
                                      <div>
                                          <div className="font-bold text-xs">{first.student_name}</div>
                                          <div className="text-[10px] text-gray-500">{first.course} {first.year_level}</div>
                                      </div>
                                  ) : first.supplier ? (
                                      <div>
                                          <span className="text-[10px] text-gray-400 uppercase">Supplier</span>
                                          <div className="font-bold text-xs">{first.supplier}</div>
                                      </div>
                                  ) : (
                                      <span className="text-gray-400 italic text-xs">N/A</span>
                                  )}
                                  {first.remarks && (
                                      <div className="mt-2 text-[10px] bg-yellow-50 text-yellow-800 p-1 rounded border border-yellow-100">
                                          {first.remarks}
                                      </div>
                                  )}
                              </td>

                              {/* 4. Items List (Uses displayItems to show content even for orphan voids) */}
                              <td className="py-2">
                                  <div className="space-y-1">
                                      {displayItems.map(item => (
                                          <div key={item.id} className="flex justify-between items-start text-xs border-b border-dashed border-gray-200 pb-1 last:border-0">
                                              <div className="flex flex-col max-w-[200px]">
                                                  <span className="truncate font-medium" title={item.product_name_snapshot || item.product_name}>
                                                      {item.product_name_snapshot || "Item"}
                                                  </span>
                                                  <span className="text-[9px] text-gray-400 font-mono tracking-tighter">
                                                    {item.barcode_snapshot || item.product_id}
                                                  </span>
                                              </div>
                                              <span className="font-mono text-gray-500 whitespace-nowrap ml-2 mt-0.5">
                                                  {item.qty} x {Number(item.price_snapshot ?? item.price).toFixed(2)}
                                              </span>
                                          </div>
                                      ))}
                                  </div>
                              </td>

                              {/* 5. Total Value */}
                              <td className="py-2 text-right font-mono font-bold text-sm">
                                  {first.type === 'ISSUANCE_RETURN' ? '-' : ''}
                                  {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>

                              {/* 6. Staff & Void Details */}
                              <td className="py-2 text-right">
                                  <div className="text-xs font-semibold">{first.staff_name}</div>
                                  
                                  {/* Enhanced Void Metadata */}
                                  {isVoided && voidSource && (
                                      <div className="mt-2 pt-1 border-t border-red-100 flex flex-col items-end">
                                          <span className="text-[9px] text-red-500 font-bold uppercase tracking-wider">Voided By</span>
                                          <div className="text-[10px] text-red-700 font-medium">
                                              {voidSource.staff_name || "Unknown"}
                                          </div>
                                          <div className="text-[9px] text-red-400">
                                              {new Date(voidSource.timestamp).toLocaleString()}
                                          </div>
                                          <div className="text-[9px] text-red-500 italic mt-0.5 max-w-[100px] truncate" title={voidSource.void_reason || first.void_reason}>
                                              "{voidSource.void_reason || first.void_reason || "N/A"}"
                                          </div>
                                      </div>
                                  )}
                              </td>
                          </tr>
                      );
                  })
              )}
            </tbody>
          </table>
        </div>
        {/* PAGINATION FOOTER */}
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 border-t pt-4 gap-4">
            <div className="text-xs text-gray-500">
                {totalCount > 0 
                  ? `Showing ${(page - 1) * ITEMS_PER_PAGE + 1} - ${Math.min(page * ITEMS_PER_PAGE, totalCount)} of ${totalCount} records`
                  : "No records found"}
            </div>

            <div className="flex items-center gap-2">
                <button 
                    className="btn btn-sm btn-outline"
                    disabled={page === 1 || loading}
                    onClick={() => {
                        setPage(p => p - 1);
                        setJumpPage(p => p - 1);
                    }}
                >
                    « Prev
                </button>
                
                <div className="flex items-center gap-1">
                    <input 
                        type="number" 
                        min="1" 
                        max={Math.ceil(totalCount / ITEMS_PER_PAGE) || 1}
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                let p = parseInt(jumpPage);
                                if (p > 0 && p <= Math.ceil(totalCount / ITEMS_PER_PAGE)) {
                                    setPage(p);
                                }
                            }
                        }}
                        className="input input-sm input-bordered w-16 text-center"
                    />
                    <span className="text-sm">of {Math.ceil(totalCount / ITEMS_PER_PAGE) || 1}</span>
                </div>

                <button 
                    className="btn btn-sm btn-outline"
                    disabled={page >= Math.ceil(totalCount / ITEMS_PER_PAGE) || loading}
                    onClick={() => {
                        setPage(p => p + 1);
                        setJumpPage(p => p + 1);
                    }}
                >
                    Next »
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}