import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useInventory } from "../hooks/useInventory";

export default function TransactionHistory({ lastUpdated, onUpdate }) {
  const { userRole } = useAuth();
  const { voidTransaction, loading: voidLoading } = useInventory();
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchTransactions();
  }, [lastUpdated, page]);

  const fetchTransactions = async () => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    try {
      // 1. Fetch Transactions
      const { data: txData, count, error } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // 2. Fetch User Names (Manual Join)
      // We fetch the directory of users to map UUIDs to Names
      const userIds = [...new Set(txData.map(t => t.user_id).filter(Boolean))];
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
      const enrichedData = txData.map(t => ({
        ...t,
        staff_name: userMap[t.user_id] || 'Unknown Staff'
      }));

      setTransactions(enrichedData || []);
      setTotalCount(count || 0);

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
        <div className="flex justify-between items-center mb-4">
            <h2 className="card-title text-lg">Transaction History</h2>
            <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500 font-semibold">
                    Page {page} of {Math.ceil(totalCount / ITEMS_PER_PAGE) || 1}
                </span>
                <div className="join flex gap-2">
                    <button 
                        className="btn btn-sm btn-outline bg-white hover:bg-gray-100" 
                        disabled={page === 1 || loading} 
                        onClick={()=>setPage(p=>p-1)}
                    >
                        « Previous
                    </button>
                    <button 
                        className="btn btn-sm btn-outline bg-white hover:bg-gray-100"
                        disabled={(page * ITEMS_PER_PAGE) >= totalCount || loading} 
                        onClick={()=>setPage(p=>p+1)}
                    >
                        Next »
                    </button>
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
                   // 1. Identify Reversal/Void Rows to get Admin Info & Reason
                   // The "Voider" is the user attached to the row with type 'VOID'
                   const voidEntry = items.find(i => i.type === 'VOID');
                   
                   // 2. Filter out 'VOID' rows for the visual item list (to prevent duplication)
                   const nonVoidItems = items.filter(i => i.type !== 'VOID');
                   // Fallback: If for some reason only void rows exist, show them
                   const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                   
                   const first = displayItems[0];
                   
                   // 3. Determine Status
                   const isVoided = items.some(i => i.is_voided);
                   const isReversalView = first.type === 'VOID'; 

                   // Styles: Dim if voided, Red background if it IS a void entry
                   const rowClass = isReversalView ? "bg-red-50" : isVoided ? "opacity-50 grayscale bg-gray-50" : "";

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
                          <span className={`font-bold text-[10px] uppercase px-2 py-1 rounded-full 
                            ${first.type === 'RECEIVING' ? 'bg-green-100 text-green-700' : 
                              first.type === 'ISSUANCE' ? 'bg-blue-100 text-blue-700' :
                              first.type === 'VOID' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                            {first.type.replace('_', ' ')}
                          </span>
                       </td>

                       {/* Column 3: Context (Student/Supplier/Staff/Remarks) */}
                       <td className="align-top py-3">
                          {/* Student Info */}
                          {first.student_name && (
                             <div className="mb-1">
                               <div className="font-bold text-xs">{first.student_name}</div>
                               <div className="text-[10px] text-gray-500">{first.course} {first.year_level}</div>
                             </div>
                          )}
                          
                          {/* Supplier Info */}
                          {first.supplier && (
                             <div className="text-xs mb-1">
                                <span className="font-semibold text-gray-500">Supp:</span> {first.supplier}
                             </div>
                          )}

                          {/* Remarks */}
                          {first.remarks && (
                             <div className="text-[10px] italic text-gray-600 mb-1 bg-yellow-50 p-1 rounded border border-yellow-100 inline-block">
                                Note: {first.remarks}
                             </div>
                          )}

                          {/* Original Encoder Info */}
                          <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                               <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A9.916 9.916 0 0010 18c2.695 0 5.145-1.052 6.793-2.61A5.99 5.99 0 0010 12z" clipRule="evenodd" />
                             </svg>
                             Encoder: <span className="font-semibold">{first.staff_name}</span>
                          </div>

                          {/* VOID DETAILS BLOCK */}
                          {(isVoided || voidEntry) && (
                              <div className="mt-2 p-2 border-l-2 border-red-500 bg-red-50 text-[10px] rounded-r">
                                  <div className="font-bold text-red-600 uppercase tracking-wider mb-1">VOID DETAILS</div>
                                  
                                  <div className="text-gray-700">
                                      <span className="font-semibold">Reason:</span> {voidEntry?.void_reason || first.void_reason || "N/A"}
                                  </div>
                                  
                                  {voidEntry && (
                                      <div className="text-gray-700 mt-1">
                                          <span className="font-semibold">Voided By:</span> {voidEntry.staff_name}
                                      </div>
                                  )}
                              </div>
                          )}
                       </td>

                      {/* Column 4: Item Summary */}
                       <td className="align-top py-3">
                          <ul className="space-y-2">
                             {displayItems.map(i => (
                               <li key={i.id} className="flex flex-col text-[10px] border-b border-dashed border-gray-200 pb-1">
                                  <div className="flex justify-between font-medium">
                                      <span className="truncate max-w-[150px]" title={i.product_name_snapshot}>
                                        {i.product_name_snapshot || "Item"}
                                      </span>
                                      <span>
                                          {i.qty} x ₱{Number(i.price_snapshot).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </span>
                                  </div>
                               </li>
                             ))}
                          </ul>
                       </td>

                       {/* Column 5: Actions */}
                       <td className="align-top text-right py-3">
                          {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && !isVoided && !isReversalView && (
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