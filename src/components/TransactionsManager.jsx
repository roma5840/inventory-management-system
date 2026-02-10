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
  const ITEMS_PER_PAGE = 20;
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Debounce Search Effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchRef(localSearch);
    }, 400); // Wait 400ms after typing stops

    return () => {
      clearTimeout(handler);
    };
  }, [localSearch]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, typeFilter, modeFilter, searchRef]);

  useEffect(() => {
    fetchTransactions();
  }, [currentPage, dateFilter, typeFilter, modeFilter, searchRef]);

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
        // Includes Student Name, Student ID, and Supplier in search (Removed Reference Number)
        query = query.or(`student_name.ilike.%${searchRef}%,student_id.ilike.%${searchRef}%,supplier.ilike.%${searchRef}%`);
    }

    return query;
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      let query = buildQuery(false);

      // Pagination Range
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data: txData, count, error } = await query;
      if (error) throw error;

      // --- LOGIC FIX: PREVENT DOUBLE ENTRY ON PAGINATION ---
      // Only apply this cleaning if viewing "ALL" types. If filtering by specific type (e.g. Issuance),
      // the VOID row is filtered out by SQL, so we must show the original row regardless of page.
      let cleanedData = txData || [];
      
      if (typeFilter === 'ALL') {
         cleanedData = cleanedData.filter(row => {
            if (!row.is_voided) return true; 
            if (row.type === 'VOID') return true; 
            // If it's a voided original, keep ONLY if the VOID marker is also in this batch
            const hasVoidMarkerInBatch = txData.some(r => r.reference_number === row.reference_number && r.type === 'VOID');
            return hasVoidMarkerInBatch;
         });
      }

      // --- ORPHAN VOID FIX START ---
      // If we have a VOID row but pagination/filters hid the original, fetch it now.
      let combinedData = [...cleanedData];
      
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
    if (searchRef && 
        !curr.student_name?.toLowerCase().includes(searchRef.toLowerCase()) &&
        !curr.student_id?.toString().toLowerCase().includes(searchRef.toLowerCase()) &&
        !curr.supplier?.toLowerCase().includes(searchRef.toLowerCase())
       ) {
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
            
            // Determine if we show Cost or Price based on transaction type
            const isCostType = ['RECEIVING', 'PULL_OUT'].includes(item.type);
            
            // Get the appropriate value
            const unitValue = isCostType 
                ? (item.unit_cost_snapshot ?? 0) 
                : (item.price_snapshot ?? item.price);

            const totalValue = unitValue * item.qty;

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
                
                // Dynamic Value Columns
                "Valuation Type": isCostType ? "UNIT COST" : "UNIT PRICE",
                "Unit Value": unitValue,
                "Total Amount": totalValue,
                
                // Use void_reason if type is VOID, otherwise default remarks
                "Remarks": (item.type === 'VOID' && item.void_reason) ? item.void_reason : (item.remarks || ""),
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

                {/* Export Button - Restricted to SUPER_ADMIN */}
                {userRole === 'SUPER_ADMIN' && (
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
                )}
                
                {/* Search - Pushed to the right on larger screens */}
                <input 
                    type="text" 
                    placeholder="Search Name, ID or Supplier..." 
                    className="input input-sm input-bordered w-full sm:w-64 sm:ml-auto"
                    value={localSearch}
                    onChange={e => setLocalSearch(e.target.value)}
                />
            </div>
        </div>

        {/* DETAILED TABLE */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="table w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-24">Type</th>
                <th className="w-24">Date</th>
                <th className="w-32">Ref #</th>
                <th className="w-24">Student No.</th>
                <th className="w-48">Name / Supplier</th>
                <th>Items Breakdown</th>
                <th className="text-right w-24">Value</th>
                <th className="w-32 text-right">Staff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                  <tr><td colSpan="8" className="text-center py-10">Loading records...</td></tr>
              ) : Object.keys(groupedTransactions).length === 0 ? (
                  <tr><td colSpan="8" className="text-center py-10 text-gray-400">No transactions found matching filters.</td></tr>
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

                      // --- LOGIC CHANGE: Detect Cost vs Price ---
                      const isCostType = ['RECEIVING', 'PULL_OUT'].includes(first.type);

                      // 3. Calculate Total Value (Dynamic based on Type)
                      const totalValue = displayItems.reduce((sum, item) => {
                          const val = isCostType 
                            ? (item.unit_cost_snapshot ?? 0)
                            : (item.price_snapshot ?? item.price);
                          return sum + (val * item.qty);
                      }, 0);

                      // 4. Void Metadata source
                      const voidSource = voidRow || (isOrphanVoid ? first : null);

                      return (
                          <tr key={refNo} className={`border-b hover:bg-gray-50 align-top ${isVoided ? 'opacity-50 grayscale bg-gray-50' : ''}`}>
                              
                              {/* 1. Type */}
                                <td className="py-2">
                                {isOrphanVoid ? (
                                    <div className="badge badge-sm font-bold border-0 bg-gray-200 text-gray-800">
                                        TRANSACTION
                                    </div>
                                ) : (
                                    <div className={`badge badge-sm font-bold border-0 
                                        ${first.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-800' : 
                                        first.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-800' : 
                                        first.type === 'ISSUANCE_RETURN' ? 'bg-sky-100 text-sky-800' :
                                        first.type === 'PULL_OUT' ? 'bg-amber-100 text-amber-800' : 
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

                              {/* 2. Date */}
                              <td className="py-2">
                                  <div className="text-xs text-gray-700">{new Date(first.timestamp).toLocaleDateString()}</div>
                                  <div className="text-[10px] text-gray-400">{new Date(first.timestamp).toLocaleTimeString()}</div>
                              </td>

                              {/* 3. Ref */}
                              <td className="py-2">
                                  <div className="font-mono font-bold text-xs">{refNo}</div>
                                  {isVoided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                              </td>

                              {/* 4. Student No. */}
                              <td className="py-2 font-mono text-xs text-gray-600">
                                  {first.student_id || "-"}
                              </td>

                              {/* 5. Name / Supplier */}
                              <td className="py-2">
                                  {first.student_name ? (
                                      <div>
                                          <div className="font-bold text-xs">{first.student_name}</div>
                                          <div className="text-[10px] text-gray-500">
                                              {first.course} {first.year_level}
                                          </div>
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

                              {/* 6. Items Breakdown */}
                              <td className="py-2">
                                  <div className="space-y-1">
                                      {displayItems.map(item => {
                                          // Determine individual item value based on transaction type
                                          const itemVal = isCostType 
                                            ? (item.unit_cost_snapshot ?? 0)
                                            : (item.price_snapshot ?? item.price);

                                          return (
                                              <div key={item.id} className="flex justify-between items-start text-xs border-b border-dashed border-gray-200 pb-1 last:border-0">
                                                  <div className="flex flex-col pr-2">
                                                      <span className="font-medium whitespace-normal break-words leading-tight text-gray-700">
                                                          {item.product_name_snapshot || "Item"}
                                                      </span>
                                                      <span className="text-[9px] text-gray-400 font-mono tracking-tighter mt-0.5">
                                                        {item.barcode_snapshot || item.product_id}
                                                      </span>
                                                  </div>
                                                  <div className="text-right shrink-0">
                                                      <span className="font-mono text-gray-600 block">
                                                          {item.qty} x {Number(itemVal).toFixed(2)}
                                                      </span>
                                                      {/* Subtle indicator of Cost vs Price */}
                                                      <span className="text-[9px] text-gray-400 uppercase">
                                                          {isCostType ? 'Cost' : 'Price'}
                                                      </span>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                              </td>

                              {/* 7. Total Value */}
                              <td className="py-2 text-right">
                                  <div className="font-mono font-bold text-sm">
                                    {first.type === 'ISSUANCE_RETURN' ? '-' : ''}
                                    {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">
                                    {isCostType ? 'Total Cost' : 'Total Price'}
                                  </div>
                              </td>

                              {/* 8. Staff */}
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
                                          <div className="text-[9px] text-red-500 italic mt-1 bg-red-50/50 p-1.5 rounded border border-red-100/50 max-w-[150px] text-right leading-tight break-words whitespace-normal">
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
        {/* Pagination Controls */}
        <Pagination 
            totalCount={totalCount}
            itemsPerPage={ITEMS_PER_PAGE}
            currentPage={currentPage}
            onPageChange={(p) => setCurrentPage(p)}
            loading={loading}
        />
      </div>
    </div>
  );
}