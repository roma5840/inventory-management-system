import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useInventory } from "../hooks/useInventory";
import { Link } from "react-router-dom";
import LimitedInput from "./LimitedInput";
import Toast from "./Toast";

export default function TransactionHistory({ lastUpdated, onUpdate }) {
  const { userRole } = useAuth();
  const { voidTransaction, loading: voidLoading } = useInventory();
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const [voidModalRef, setVoidModalRef] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchTransactions();
  }, [lastUpdated, page]);

  const fetchTransactions = async () => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    try {
      const now = new Date();
      const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();

      // Query the VIEW instead of the base table
      const { data: txData, count, error } = await supabase
        .from('vw_transaction_history')
        .select('*', { count: 'exact' })
        .gte('timestamp', startOfDay) 
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const cleanedData = (txData || []).filter(row => {
        if (!row.is_voided) return true;
        if (row.type === 'VOID') return true;
        const hasVoidMarkerInBatch = txData.some(r => r.reference_number === row.reference_number && r.type === 'VOID');
        return hasVoidMarkerInBatch;
      });

      let combinedData = [...cleanedData];
      const distinctRefs = [...new Set(combinedData.map(t => t.reference_number).filter(Boolean))];
      const orphanRefs = [];

      distinctRefs.forEach(ref => {
          const items = combinedData.filter(t => t.reference_number === ref);
          const hasOriginal = items.some(t => t.type !== 'VOID');
          if (!hasOriginal) orphanRefs.push(ref);
      });

      if (orphanRefs.length > 0) {
          // Also query the VIEW for orphan checks
          const { data: originals } = await supabase
              .from('vw_transaction_history')
              .select('*')
              .in('reference_number', orphanRefs)
              .neq('type', 'VOID');
          
          if (originals?.length > 0) {
              combinedData = [...combinedData, ...originals];
          }
      }

      // We no longer need the auth_uid manual mapping! 
      // The DB provides `staff_name` and `original_bis` natively.
      setTransactions(combinedData || []);
      setTotalCount(count || 0);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoidClick = (refNo, bisNo) => {
    setVoidModalRef({ ref: refNo, bis: bisNo });
    setVoidReason("");
    setVoidError("");
  };

  const confirmVoid = async (e) => {
    if (e) e.preventDefault();
    
    if (!voidReason.trim()) {
      setVoidError("A reason is required to void this transaction.");
      return;
    }

    setVoidError("");
    
    // API Call uses the hidden REF string
    const result = await voidTransaction(voidModalRef.ref, voidReason);
    
    if (result.success) {
      setToast({ message: "Transaction Voided", subMessage: `BIS #${voidModalRef.bis} reversed.` });
      setVoidModalRef(null);
      
      fetchTransactions();
      if (onUpdate) onUpdate(); 
      
      await supabase.channel('app_updates').send({
          type: 'broadcast', event: 'inventory_update', payload: {} 
      });
    } else {
      setVoidError(result.error || "An unexpected error occurred.");
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
                <th>Date / BIS #</th>
                <th>Reference #</th>
                <th>Type</th>
                <th>Details</th>
                <th className="text-center">Items</th>
                {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                 <tr><td colSpan="6" className="text-center py-4">Loading...</td></tr>
              ) : Object.keys(groupedTransactions).length === 0 ? (
                 <tr><td colSpan="6" className="text-center py-4">No history found.</td></tr>
              ) : (
                Object.entries(groupedTransactions).map(([refNo, items]) => {
                   const voidEntry = items.find(i => i.type === 'VOID');
                   const nonVoidItems = items.filter(i => i.type !== 'VOID');
                   
                   const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                   const first = nonVoidItems.length > 0 ? nonVoidItems[0] : items[0];
                   
                   const isVoided = items.some(i => i.is_voided) || !!voidEntry;
                   const isOrphanVoid = items.every(i => i.type === 'VOID'); 
                   const isCostType = ['RECEIVING', 'PULL_OUT'].includes(first.type);
                   const rowClass = isVoided ? "opacity-50 grayscale bg-gray-50" : "";

                   return (
                     <tr key={refNo} className={`border-b border-gray-100 ${rowClass}`}>
                       {/* Column 1: Date & BIS # */}
                       <td className="align-top py-3">
                          <div className="text-[10px] text-gray-500 mb-1">
                            {new Date(first.timestamp).toLocaleString()}
                          </div>
                          <div className="font-black text-lg text-slate-700 leading-none">
                              #{first.bis_number || "---"}
                          </div>
                          {isVoided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                       </td>

                       {/* Column 2: Ref # */}
                       <td className="align-top py-3">
                          <div className="font-mono text-[10px] text-gray-400 select-all break-all max-w-[100px]">
                              {refNo}
                          </div>
                       </td>

                       {/* Column 3: Type */}
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

                       {/* Column 4: Context / Details */}
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

                          {/* LINKED BIS # (For Returns) */}
                          {first.type === 'ISSUANCE_RETURN' && first.original_bis && (
                             <div className="mb-2 flex items-center gap-1.5">
                                <div className="p-1 bg-sky-50 rounded text-sky-600">
                                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h9.128c1.81 0 3.5.908 4.5 2.424a5.25 5.25 0 01-4.5 8.076h-1.5a.75.75 0 010-1.5h1.5a3.75 3.75 0 003.214-5.771 3.75 3.75 0 00-3.214-1.729H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.25-5a.75.75 0 010-1.085l5.25-5a.75.75 0 011.06.025z" clipRule="evenodd" />
                                   </svg>
                                </div>
                                <div className="text-[10px] font-medium text-sky-700">
                                   Issuance Link: <span className="font-black text-xs">#{first.original_bis}</span>
                                </div>
                             </div>
                          )}
                          
                          {/* Supplier */}
                          {first.supplier && (
                             <div className="text-xs mb-1 break-all">
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

                      {/* Column 5: Item Summary */}
                       <td className="align-top py-3">
                          <ul className="space-y-2">
                             {displayItems.map((i, idx) => {
                               const unitVal = isCostType 
                                 ? (i.unit_cost_snapshot ?? 0)
                                 : (i.price_snapshot ?? i.price);

                               return (
                                 <li key={idx} className="flex flex-col text-[10px] border-b border-dashed border-gray-200 pb-1">
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

                       {/* Column 6: Actions */}
                        {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                          <td className="align-top text-right py-3">
                              {!isVoided && !isOrphanVoid && (
                                  <button 
                                    onClick={() => handleVoidClick(refNo, first.bis_number)}
                                    className="btn btn-xs btn-outline btn-error hover:shadow-md transition-all"
                                    title="Void this entire receipt"
                                  >
                                    VOID
                                  </button>
                              )}
                          </td>
                        )}
                     </tr>
                   );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Void Confirmation Modal */}
        {voidModalRef && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            {/* Professional Dark Backdrop */}
            <div 
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
              onClick={() => !voidLoading && setVoidModalRef(null)}
            ></div>

            {/* Professional Slate Modal */}
            <div className={`relative bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden transition-all ${voidLoading ? 'opacity-75 pointer-events-none' : 'scale-100'}`}>
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-red-500/20 rounded text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-white tracking-tight">Void Transaction</h3>
                </div>
                <button 
                  onClick={() => setVoidModalRef(null)}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6">
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  You are about to void <span className="font-black text-slate-900">BIS #{voidModalRef.bis || "---"}</span>. 
                  <br />
                  <span className="text-xs text-slate-400 font-mono">System ID: {voidModalRef.ref}</span>
                  <br /><br />
                  This will permanently reverse all associated inventory movements.
                </p>
                
                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label py-0 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Required Reason</span>
                    </label>
                    
                    <LimitedInput 
                      as="textarea"
                      maxLength={500}
                      showCounter={true}
                      className={`textarea textarea-bordered h-32 w-full resize-none text-sm focus:border-slate-900 focus:ring-0 ${voidError ? 'border-red-500 bg-red-50' : 'bg-slate-50'}`}
                      placeholder="Provide a detailed explanation for this reversal..."
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      disabled={voidLoading}
                      autoFocus
                    />

                    {voidError && (
                      <div className="flex items-center gap-1.5 mt-2 text-red-600">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-semibold">{voidError}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                  <button 
                    className="btn btn-ghost btn-sm text-slate-500 normal-case" 
                    onClick={() => setVoidModalRef(null)}
                    disabled={voidLoading}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-sm bg-slate-900 hover:bg-slate-800 text-white border-none px-6 normal-case" 
                    onClick={confirmVoid}
                    disabled={voidLoading}
                  >
                    {voidLoading ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        Processing
                      </>
                    ) : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && (
        <Toast 
          message={toast.message} 
          subMessage={toast.subMessage} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}