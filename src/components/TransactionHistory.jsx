import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useInventory } from "../hooks/useInventory";
import { Link } from "react-router-dom";

export default function TransactionHistory({ lastUpdated, onUpdate }) {
  const { userRole } = useAuth();
  const { voidTransaction, loading: voidLoading } = useInventory();
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    fetchTransactions();
  }, [lastUpdated, page]);

  const fetchTransactions = async () => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    try {
      // DATE FILTER: Start of Today (00:00:00)
      const now = new Date();
      const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();

      // 1. Fetch Transactions (Scoped to TODAY)
      const { data: txData, count, error } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .gte('timestamp', startOfDay) 
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // --- LOGIC FIX: PREVENT DOUBLE ENTRY ON PAGINATION ---
      // If a row is 'is_voided' but the actual 'VOID' line item (which has the latest timestamp)
      // is NOT in this batch, it means the Void happened recently (Page 1), so we hide 
      // these stale original rows from Page 2+.
      const cleanedData = (txData || []).filter(row => {
        if (!row.is_voided) return true; // Keep active transactions
        if (row.type === 'VOID') return true; // Keep the VOID marker itself
        // If it's a voided original, keep ONLY if the VOID marker is also in this current page batch
        const hasVoidMarkerInBatch = txData.some(r => r.reference_number === row.reference_number && r.type === 'VOID');
        return hasVoidMarkerInBatch;
      });

      // --- ORPHAN VOID FIX START ---
      // Check if we fetched a VOID row but lack the original row to show context (Type/Date)
      let combinedData = [...cleanedData];
      
      const distinctRefs = [...new Set(combinedData.map(t => t.reference_number).filter(Boolean))];
      const orphanRefs = [];

      distinctRefs.forEach(ref => {
          const items = combinedData.filter(t => t.reference_number === ref);
          // If group contains ONLY void items, we need the original for display context
          const hasOriginal = items.some(t => t.type !== 'VOID');
          if (!hasOriginal) orphanRefs.push(ref);
      });

      if (orphanRefs.length > 0) {
          // Fetch the original non-void transactions for these orphans
          // We ignore the "Today" filter here because we just need metadata
          const { data: originals } = await supabase
              .from('transactions')
              .select('*')
              .in('reference_number', orphanRefs)
              .neq('type', 'VOID');
          
          if (originals?.length > 0) {
              combinedData = [...combinedData, ...originals];
          }
      }
      // --- ORPHAN VOID FIX END ---

      // 2. Fetch User Names (Manual Join)
      const userIds = [...new Set(combinedData.map(t => t.user_id).filter(Boolean))];
      let userMap = {};
      
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('authorized_users')
          .select('auth_uid, full_name, email')
          .in('auth_uid', userIds);
          
        users?.forEach(u => {
            userMap[u.auth_uid] = u.full_name || u.email;
        });
      }

      // 3. Merge Data
      const enrichedData = combinedData.map(t => ({
        ...t,
        staff_name: userMap[t.user_id] || 'Unknown Staff'
      }));

      setTransactions(enrichedData || []);
      setTotalCount(count || 0); // Keep original count for pagination

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoidClick = async (refNo) => {
    if (!window.confirm(`Are you sure you want to VOID transaction ${refNo}? This cannot be undone.`)) return;
    
    const reason = prompt("Please enter a reason for voiding:");
    if (!reason) return;

    const result = await voidTransaction(refNo, reason);
    if (result.success) {
      alert("Transaction Voided Successfully.");
      fetchTransactions();
      if (onUpdate) onUpdate(); 
      await supabase.channel('app_updates').send({
          type: 'broadcast', event: 'inventory_update', payload: {} 
      });
      
    } else {
      alert("Error: " + result.error);
    }
  };
  // Helper: Group flat rows by Reference Number for cleaner display
  const groupedTransactions = transactions.reduce((acc, curr) => {
    const key = curr.reference_number || "NO_REF";
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {});

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4">
        <div className="flex justify-between items-end mb-4">
            <div>
                <h2 className="card-title text-lg">Daily Activity Log</h2>
                <div className="text-xs text-gray-500 mt-1">
                    {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">
                        {totalCount > 0 
                            ? `Page ${page} of ${Math.ceil(totalCount / ITEMS_PER_PAGE)}`
                            : "No records found"}
                    </span>
                    <div className="flex gap-2">
                        <button 
                            className="btn btn-xs btn-outline" 
                            disabled={page === 1 || loading} 
                            onClick={()=>setPage(p=>p-1)}
                        >
                            « Previous
                        </button>
                        <button 
                            className="btn btn-xs btn-outline"
                            disabled={(page * ITEMS_PER_PAGE) >= totalCount || loading} 
                            onClick={()=>setPage(p=>p+1)}
                        >
                            Next »
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-xs w-full">
            <thead>
              <tr className="bg-base-200">
                <th>Date / Ref #</th>
                <th>Type</th>
                <th>Details</th>
                <th className="text-center">Items</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                 <tr><td colSpan="5" className="text-center py-4">Loading...</td></tr>
              ) : Object.keys(groupedTransactions).length === 0 ? (
                 <tr><td colSpan="5" className="text-center py-4">No history found.</td></tr>
              ) : (
                Object.entries(groupedTransactions).map(([refNo, items]) => {
                   // 1. Identify specific rows
                   const voidEntry = items.find(i => i.type === 'VOID');
                   const nonVoidItems = items.filter(i => i.type !== 'VOID');
                   
                   // 2. Determine Display Data
                   const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                   const first = nonVoidItems.length > 0 ? nonVoidItems[0] : items[0];
                   
                   // 3. Status Flags
                   const isVoided = items.some(i => i.is_voided) || !!voidEntry;
                   const isOrphanVoid = items.every(i => i.type === 'VOID'); 

                   // --- LOGIC CHANGE: Detect Cost vs Price ---
                   const isCostType = ['RECEIVING', 'PULL_OUT'].includes(first.type);

                   // 4. Styles
                   const rowClass = isVoided ? "opacity-50 grayscale bg-gray-50" : "";

                   return (
                     <tr key={refNo} className={`border-b border-gray-100 ${rowClass}`}>
                       {/* Column 1: Date & Ref */}
                       <td className="align-top py-3">
                          <div className="font-mono font-bold text-xs">{refNo}</div>
                          <div className="text-[10px] text-gray-500">
                            {new Date(first.timestamp).toLocaleString()}
                          </div>
                          {isVoided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                       </td>

                       {/* Column 2: Type */}
                        <td className="align-top py-3">
                          {isOrphanVoid ? (
                            <span className="font-bold text-[10px] uppercase px-2 py-1 rounded-full bg-gray-200 text-gray-600">
                                TRANSACTION
                            </span>
                          ) : (
                            <span className={`font-bold text-[10px] uppercase px-2 py-1 rounded-full 
                                ${first.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-700' : 
                                  first.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-700' :
                                  first.type === 'ISSUANCE_RETURN' ? 'bg-sky-100 text-sky-700' :
                                  first.type === 'PULL_OUT' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-700'}`}>
                                {first.type.replace('_', ' ')}
                            </span>
                          )}
                        </td>

                       {/* Column 3: Context */}
                       <td className="align-top py-3 max-w-[300px] md:max-w-[400px]">
                          {/* Student Info */}
                          {first.student_name && (
                             <div className="mb-1">
                               <div className="font-bold text-xs">{first.student_name}</div>
                               <div className="text-[10px] text-gray-500">
                                  {first.student_id && (
                                      <span className="font-mono bg-gray-100 px-1 rounded mr-1 text-gray-600">
                                          {first.student_id}
                                      </span>
                                  )}
                                  {first.course} {first.year_level}
                               </div>
                             </div>
                          )}
                          
                          {/* Supplier */}
                          {first.supplier && (
                             <div className="text-xs mb-1">
                                <span className="font-semibold text-gray-500">Supp:</span> {first.supplier}
                             </div>
                          )}

                          {/* Remarks */}
                          {first.remarks && (
                             <div className="text-[10px] italic text-gray-600 mb-1 bg-yellow-50 p-2 rounded border border-yellow-100 block whitespace-normal break-words max-h-24 overflow-y-auto">
                                <span className="font-bold not-italic">Note:</span> {first.remarks}
                             </div>
                          )}

                          {/* Staff Info */}
                          <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                               <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A9.916 9.916 0 0010 18c2.695 0 5.145-1.052 6.793-2.61A5.99 5.99 0 0010 12z" clipRule="evenodd" />
                             </svg>
                             Encoder: <span className="font-semibold">{first.staff_name}</span>
                          </div>

                          {/* VOID DETAILS */}
                          {(isVoided || voidEntry) && (
                              <div className="mt-2 p-2 border-l-2 border-red-500 bg-red-50 text-[10px] rounded-r">
                                  <div className="font-bold text-red-600 uppercase tracking-wider mb-1">VOID DETAILS</div>
                                  <div className="text-gray-700">
                                      <span className="font-semibold">Reason:</span> {voidEntry?.void_reason || first.void_reason || "N/A"}
                                  </div>
                                  {voidEntry && (
                                      <div className="text-gray-700 mt-1">
                                          <div><span className="font-semibold">Voided By:</span> {voidEntry.staff_name}</div>
                                          <div className="text-gray-400 mt-0.5">
                                              {new Date(voidEntry.timestamp).toLocaleString()}
                                          </div>
                                      </div>
                                  )}
                              </div>
                          )}
                       </td>

                      {/* Column 4: Item Summary (UPDATED WITH COST LOGIC) */}
                       <td className="align-top py-3">
                          <ul className="space-y-2">
                             {displayItems.map(i => {
                               // Determine value to display
                               const unitVal = isCostType 
                                 ? (i.unit_cost_snapshot ?? 0)
                                 : (i.price_snapshot ?? i.price);

                               return (
                                 <li key={i.id} className="flex flex-col text-[10px] border-b border-dashed border-gray-200 pb-1">
                                    <div className="flex justify-between font-medium">
                                        <span className="truncate max-w-[150px]" title={i.product_name_snapshot}>
                                          {i.product_name_snapshot || "Item"}
                                        </span>
                                        <div className="text-right">
                                            <span>
                                              {i.qty} x ₱{Number(unitVal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                            {isCostType && (
                                                <span className="text-[9px] text-gray-400 block -mt-0.5">(Cost)</span>
                                            )}
                                        </div>
                                    </div>
                                 </li>
                               );
                             })}
                          </ul>
                       </td>

                       {/* Column 5: Actions */}
                       <td className="align-top text-right py-3">
                          {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && !isVoided && !isOrphanVoid && (
                              <button 
                                onClick={() => handleVoidClick(refNo)}
                                disabled={voidLoading}
                                className="btn btn-xs btn-outline btn-error"
                                title="Void this entire receipt"
                              >
                                VOID
                              </button>
                          )}
                       </td>
                     </tr>
                   );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}