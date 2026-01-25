import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useInventory } from "../hooks/useInventory";

export default function TransactionHistory({ lastUpdated }) {
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

    const { data, count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' }) // Request total row count
      .order('timestamp', { ascending: false })
      .range(from, to);

    if (error) {
      console.error(error);
    } else {
      setTransactions(data || []);
      setTotalCount(count || 0);
    }
    
    setLoading(false);
  };

  const handleVoidClick = async (refNo) => {
    if (!window.confirm(`Are you sure you want to VOID transaction ${refNo}? This cannot be undone.`)) return;
    
    const reason = prompt("Please enter a reason for voiding:");
    if (!reason) return;

    const result = await voidTransaction(refNo, reason);
    if (result.success) {
      alert("Transaction Voided Successfully.");
      fetchTransactions(); // Refresh UI
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
                   const first = items[0];
                   const isVoided = items.some(i => i.is_voided);
                   const isVoidEntry = first.type === 'VOID';
                   
                   // Styles: Dim if voided, Red background if it IS a void entry
                   const rowClass = isVoidEntry ? "bg-red-50" : isVoided ? "opacity-50 grayscale bg-gray-50" : "";

                   return (
                     <tr key={refNo} className={`border-b border-gray-100 ${rowClass}`}>
                       {/* Column 1: Date & Ref */}
                       <td className="align-top py-3">
                          <div className="font-mono font-bold text-xs">{refNo}</div>
                          <div className="text-[10px] text-gray-500">
                            {new Date(first.timestamp).toLocaleString()}
                          </div>
                          {isVoided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                          {isVoidEntry && <span className="badge badge-xs badge-warning mt-1">REVERSAL</span>}
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

                       {/* Column 3: Context (Student/Supplier) */}
                       <td className="align-top py-3">
                          {first.student_name && (
                             <div>
                               <div className="font-bold">{first.student_name}</div>
                               <div className="text-[10px]">{first.course} {first.year_level}</div>
                             </div>
                          )}
                          {first.supplier && <div className="text-xs">Supp: {first.supplier}</div>}
                          {first.void_reason && <div className="text-[10px] italic text-red-600">Reason: {first.void_reason}</div>}
                       </td>

                       {/* Column 4: Item Summary */}
                       <td className="align-top py-3">
                          <ul className="space-y-1">
                             {items.map(i => (
                               <li key={i.id} className="flex justify-between text-[10px] border-b border-dashed border-gray-200 pb-1">
                                  <span className="truncate max-w-[150px]">{i.product_name_snapshot || "Item"}</span>
                                  <span className="font-mono">
                                    {i.qty} x {Number(i.price_snapshot).toFixed(2)}
                                  </span>
                               </li>
                             ))}
                          </ul>
                       </td>

                       {/* Column 5: Actions */}
                       <td className="align-top text-right py-3">
                          {/* ONLY Show Void Button if:
                              1. User is ADMIN
                              2. It is NOT already voided
                              3. It is NOT a "VOID" entry itself
                          */}
                          {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && !isVoided && !isVoidEntry && (
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