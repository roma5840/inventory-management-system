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
  const ITEMS_PER_PAGE = 10;

  const [expandedCards, setExpandedCards] = useState(new Set());
  const toggleCard = (refNo) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(refNo)) next.delete(refNo);
      else next.add(refNo);
      return next;
    });
  };

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

      // Step 1: Fetch EXACTLY 10 Headers from the DB View (Zero wasted data)
      const { data: headerData, count, error: headerError } = await supabase
        .from('vw_transaction_headers')
        .select('*', { count: 'exact' })
        .gte('timestamp', startOfDay) 
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (headerError) throw headerError;
      setTotalCount(count || 0);

      if (!headerData || headerData.length === 0) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch the line items ONLY for those 10 references
      const pageRefs = headerData.map(h => h.reference_number);
      const { data: txData, error: txError } = await supabase
        .from('vw_transaction_history')
        .select('*')
        .in('reference_number', pageRefs)
        .order('timestamp', { ascending: false });

      if (txError) throw txError;

      // Clean void items to prevent duplicate line-item rendering
      const cleanedData = (txData || []).filter(row => {
        if (!row.is_voided) return true;
        if (row.type === 'VOID') return true;
        return txData.some(r => r.reference_number === row.reference_number && r.type === 'VOID');
      });

      setTransactions(cleanedData || []);

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
    <div className="card bg-white border border-slate-200 shadow-sm rounded-xl">
      <div className="card-body p-6">
        <div className="flex justify-between items-end mb-6 pb-4 border-b border-slate-100">
            <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Daily Activity Log</h2>
                <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">
                    {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {totalCount > 0 
                        ? `Page ${page} of ${Math.ceil(totalCount / ITEMS_PER_PAGE)}`
                        : "No records found"}
                </span>
                <div className="flex gap-1.5">
                    <button 
                        className="btn btn-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors rounded-md px-3" 
                        disabled={page === 1 || loading} 
                        onClick={()=>setPage(p=>p-1)}
                    >
                        Prev
                    </button>
                    <button 
                        className="btn btn-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors rounded-md px-3"
                        disabled={(page * ITEMS_PER_PAGE) >= totalCount || loading} 
                        onClick={()=>setPage(p=>p+1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
                <span className="loading loading-spinner loading-md mb-2"></span>
            </div>
          ) : Object.keys(groupedTransactions).length === 0 ? (
            <div className="py-12 text-center text-slate-400">
                <p className="text-xs font-bold uppercase tracking-widest">No history found</p>
            </div>
          ) : (
            Object.entries(groupedTransactions).map(([refNo, items]) => {
                const voidEntry = items.find(i => i.type === 'VOID');
                const nonVoidItems = items.filter(i => i.type !== 'VOID');
                
                const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                const first = nonVoidItems.length > 0 ? nonVoidItems[0] : items[0];
                
                const isVoided = items.some(i => i.is_voided) || !!voidEntry;
                const isOrphanVoid = items.every(i => i.type === 'VOID'); 
                const isCostType = ['RECEIVING', 'PULL_OUT'].includes(first.type);
                const isExpanded = expandedCards.has(refNo);

                // Styling logic based on transaction type
                const getTypeStyles = (type, isVoid) => {
                    if (isVoid) return { bar: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500' };
                    switch(type) {
                        case 'RECEIVING': return { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' };
                        case 'ISSUANCE': return { bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800' };
                        case 'ISSUANCE_RETURN': return { bar: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800' };
                        case 'PULL_OUT': return { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' };
                        default: return { bar: 'bg-slate-300', badge: 'bg-slate-100 text-slate-800' };
                    }
                };

                const styles = getTypeStyles(first.type, isVoided);
                
                // Determine primary entity string for summary view
                let entityName = "Unknown Entity";
                if (first.transaction_mode === 'TRANSMITTAL') entityName = `Dept: ${first.department}`;
                else if (first.student_name) entityName = first.student_name;
                else if (first.supplier) entityName = first.supplier;
                else if (isOrphanVoid) entityName = "System Reversal";

                return (
                  <div key={refNo} className={`bg-white border border-slate-200 rounded-xl shadow-sm flex overflow-hidden transition-all hover:shadow-md relative ${isVoided ? 'bg-slate-50/80 grayscale-[50%]' : ''}`}>
                    {/* Left edge colored bar */}
                    <div className={`w-1.5 shrink-0 ${styles.bar}`} />
                    
                    {isVoided && (
                        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 8px)' }}></div>
                    )}

                    <div className="flex-1 p-5">
                      {/* Top Header Row */}
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3">
                              <span className="font-mono text-xl font-bold text-slate-900 tracking-tight">#{first.bis_number || "---"}</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${styles.badge}`}>
                                  {isOrphanVoid ? 'TRANSACTION' : first.type.replace('_', ' ')}
                              </span>
                              {first.transaction_mode && !isOrphanVoid && (
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 rounded-md px-1.5 py-0.5">
                                      {first.transaction_mode}
                                  </span>
                              )}
                              {isVoided && <span className="badge badge-error badge-sm text-[10px] font-bold uppercase tracking-widest border-none">VOIDED</span>}
                          </div>
                          <div className="text-right">
                              <div className="text-xs font-bold text-slate-700">{new Date(first.timestamp).toLocaleDateString()}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(first.timestamp).toLocaleTimeString()}</div>
                          </div>
                      </div>

                      {/* Body Row (always visible) */}
                      <div className="flex justify-between items-end">
                          <div>
                              <div className="text-sm font-semibold text-slate-800">{entityName}</div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                                  <span>Enc: <span className="font-bold text-slate-700 normal-case">{first.staff_name}</span></span>
                                  <span className="text-slate-300">•</span>
                                  <span>Ref: <span className="font-mono text-slate-600 font-medium">{refNo}</span></span>
                              </div>
                          </div>
                          
                          <div className="flex items-center gap-3 relative z-10">
                              {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && !isVoided && !isOrphanVoid && (
                                  <button 
                                      onClick={(e) => { e.stopPropagation(); handleVoidClick(refNo, first.bis_number); }}
                                      className="text-[10px] font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 px-2 py-1 rounded transition-colors uppercase tracking-widest"
                                  >
                                      Void Receipt
                                  </button>
                              )}
                              <button 
                                  onClick={() => toggleCard(refNo)} 
                                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 uppercase tracking-widest transition-colors bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200"
                              >
                                  {isExpanded ? 'Hide Details' : 'View Details'}
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                  </svg>
                              </button>
                          </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                          <div className="mt-5 pt-5 border-t border-slate-100 bg-slate-50/50 -mx-5 -mb-5 p-5">
                              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                                  
                                  {/* Left Col: Context Details */}
                                  <div className="lg:col-span-2 space-y-4">
                                      {/* Transmittal Specifics */}
                                      {first.transaction_mode === 'TRANSMITTAL' && (
                                          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-2">Transmittal Details</span>
                                              {first.transmittal_no && <div className="text-xs font-mono font-bold text-slate-700 mb-1">TR #: {first.transmittal_no}</div>}
                                              <div className="space-y-1 text-[11px] text-slate-600">
                                                  {first.requested_by && <div><span className="font-bold text-slate-400">Req:</span> {first.requested_by}</div>}
                                                  {first.released_by && <div><span className="font-bold text-slate-400">Rel:</span> {first.released_by}</div>}
                                                  {first.charge_to && <div><span className="font-bold text-slate-400">Charge:</span> {first.charge_to}</div>}
                                                  {first.purpose && <div className="italic text-slate-500 mt-2">"{first.purpose}"</div>}
                                              </div>
                                          </div>
                                      )}

                                      {/* Standard Entity / Released By Info (Non-Transmittal) */}
                                      {first.transaction_mode !== 'TRANSMITTAL' && (first.student_name || first.supplier || first.released_by) && (
                                          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                                                  {first.student_name ? 'Student Details' : first.supplier ? 'Supplier Details' : 'Transaction Info'}
                                              </span>
                                              
                                              {first.student_name && (
                                                  <div className="space-y-1 text-[11px] text-slate-600 mb-2 pb-2 border-b border-slate-50">
                                                      <div className="font-bold text-slate-800 text-xs">{first.student_name}</div>
                                                      {first.student_id && <div><span className="font-bold text-slate-400">ID:</span> <span className="font-mono">{first.student_id}</span></div>}
                                                      {first.course && <div><span className="font-bold text-slate-400">Course:</span> {first.course}</div>}
                                                      {first.year_level && <div><span className="font-bold text-slate-400">Year Level:</span> {first.year_level}</div>}
                                                  </div>
                                              )}
                                              
                                              {first.supplier && (
                                                  <div className="space-y-1 text-[11px] text-slate-600 mb-2 pb-2 border-b border-slate-50">
                                                      <div className="font-bold text-slate-800 text-xs">{first.supplier}</div>
                                                  </div>
                                              )}

                                              {first.released_by && (
                                                  <div className="text-[11px] text-slate-600">
                                                      <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mr-1">Rel:</span> {first.released_by}
                                                  </div>
                                              )}
                                          </div>
                                      )}

                                      {/* Link / Remarks */}
                                      {first.type === 'ISSUANCE_RETURN' && first.original_bis && (
                                          <div className="bg-sky-50 border border-sky-100 p-3 rounded-lg text-sky-800 text-xs flex items-start gap-2">
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
                                                  <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h9.128c1.81 0 3.5.908 4.5 2.424a5.25 5.25 0 01-4.5 8.076h-1.5a.75.75 0 010-1.5h1.5a3.75 3.75 0 003.214-5.771 3.75 3.75 0 00-3.214-1.729H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.25-5a.75.75 0 010-1.085l5.25-5a.75.75 0 011.06.025z" clipRule="evenodd" />
                                              </svg>
                                              <div><span className="font-bold uppercase tracking-widest text-[10px] block mb-0.5">Linked Issuance</span> <span className="font-mono font-bold">#{first.original_bis}</span></div>
                                          </div>
                                      )}

                                      {first.remarks && (
                                          <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-amber-800 text-xs">
                                              <span className="font-bold uppercase tracking-widest text-[10px] block mb-1">Remarks</span>
                                              <div className="italic">"{first.remarks}"</div>
                                          </div>
                                      )}

                                      {/* Void Callout */}
                                      {(isVoided || voidEntry) && (
                                          <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                                              <span className="font-black text-red-600 uppercase tracking-widest text-[10px] block mb-1.5">Void Details</span>
                                              <div className="text-xs text-red-900 font-medium mb-1">Reason: <span className="font-normal italic">"{voidEntry?.void_reason || first.void_reason || "N/A"}"</span></div>
                                              {voidEntry && (
                                                  <div className="text-[10px] text-red-700 mt-2 uppercase tracking-widest font-bold">
                                                      Voided by <span className="normal-case">{voidEntry.staff_name}</span> <span className="text-red-400 font-normal ml-1 normal-case">({new Date(voidEntry.timestamp).toLocaleString()})</span>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                  </div>

                                  {/* Right Col: Items List */}
                                  <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 border-b border-slate-100 pb-2">Item Breakdown</span>
                                      <ul className="space-y-2.5">
                                         {displayItems.map((i, idx) => {
                                           const itemIsCashMode = i.transaction_mode === 'CASH';
                                           const unitVal = isCostType 
                                             ? (i.unit_cost_snapshot ?? 0)
                                             : itemIsCashMode ? (i.cash_price_snapshot ?? 0) : (i.price_snapshot ?? i.price);

                                           return (
                                             <li key={idx} className="flex justify-between items-start text-xs group">
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="font-medium text-slate-800 truncate" title={i.product_name_snapshot}>{i.product_name_snapshot || "Item"}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{i.barcode_snapshot || i.product_id}</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="font-mono text-slate-700 font-medium">
                                                      {i.qty} <span className="text-slate-400 px-1">×</span> ₱{Number(unitVal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">
                                                        Total: ₱{(i.qty * unitVal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                             </li>
                                           );
                                         })}
                                      </ul>
                                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Total</span>
                                          <span className="font-mono font-bold text-sm text-slate-900">
                                              ₱{displayItems.reduce((sum, item) => {
                                                  const val = isCostType ? (item.unit_cost_snapshot ?? 0) : item.transaction_mode === 'CASH' ? (item.cash_price_snapshot ?? 0) : (item.price_snapshot ?? item.price);
                                                  return sum + (val * item.qty);
                                              }, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                          </span>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                    </div>
                  </div>
                );
            })
          )}
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