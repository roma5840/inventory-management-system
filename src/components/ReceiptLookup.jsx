import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import PrintLayout from "./PrintLayout";
import LimitedInput from "./LimitedInput";

export default function ReceiptLookup() {
  const [searchRef, setSearchRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [error, setError] = useState("");
  
  // New State: Handles multiple matches (e.g., Issuance #1 and Receiving #1)
  const [searchResults, setSearchResults] = useState([]); 

  // Close modal on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") {
        setSearchResults([]);
        setReceiptData(null); // Add this to also close the opened receipt
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    const term = searchRef.trim().toUpperCase();
    if (!term) return;
    
    setLoading(true);
    setError("");
    setReceiptData(null);
    setSearchResults([]); 
    
    try {
      let query = supabase.from('vw_transaction_history').select('*');
      const isBisSearch = /^\d+$/.test(term);

      if (isBisSearch) {
          query = query.eq('bis_number', parseInt(term));
      } else {
          query = query.eq('reference_number', term);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        setError(`No records found for ${isBisSearch ? 'BIS #' : 'Ref'} ${term}.`);
        return;
      }

      // Filter out 'VOID' entries (the reversal lines), but keep original lines (even if they are marked is_voided)
      const cleanData = data.filter(item => item.type !== 'VOID');

      const grouped = {};
      cleanData.forEach(row => {
          if (!grouped[row.reference_number]) {
              grouped[row.reference_number] = [];
          }
          grouped[row.reference_number].push(row);
      });

      const groups = Object.values(grouped);

      if (groups.length === 0) {
           setError("Transactions found but appear to be invalid or fully voided.");
      } else if (groups.length === 1) {
           await loadReceipt(groups[0]);
      } else {
           // Sort by timestamp DESC (most recent first)
           const sortedGroups = groups.sort((a, b) => 
            new Date(b[0].timestamp) - new Date(a[0].timestamp)
           );
           setSearchResults(sortedGroups);
      }

    } catch (err) {
      console.error(err);
      setError("Error retrieving data.");
    } finally {
      setLoading(false);
    }
  };

  const loadReceipt = async (items) => {
    if (!items || items.length === 0) return;
    const header = items[0];
    const resolvedStaffName = header.staff_name || "Unknown Staff";
    const isVoided = items.some(d => d.is_voided);

    const formattedReceipt = {
        refNumber: header.reference_number,
        bisNumber: header.bis_number || "---",
        type: header.type,
        transactionMode: header.transaction_mode,
        date: new Date(header.timestamp).toLocaleString(),
        studentName: header.student_name,
        studentId: header.student_id,
        course: header.course,
        yearLevel: header.year_level,
        supplier: header.supplier,
        transmittalNo: header.transmittal_no,
        department: header.department,
        requestedBy: header.requested_by,
        releasedBy: header.released_by,
        receivedBy: header.received_by,
        purpose: header.purpose,
        chargeTo: header.charge_to,
        staffName: resolvedStaffName,
        remarks: header.remarks,
        isVoided: isVoided,
        voidReason: header.void_reason,
        items: items.map(item => {
            let effectivePrice = item.price_snapshot !== null ? item.price_snapshot : 0;
            if (header.transaction_mode === 'CASH' && item.cash_price_snapshot !== null) {
                effectivePrice = item.cash_price_snapshot;
            }
            return {
                itemName: item.product_name_snapshot,
                qty: item.qty,
                price: effectivePrice,
                cashPrice: item.cash_price_snapshot !== null ? item.cash_price_snapshot : 0,
                cost: item.unit_cost_snapshot !== null ? item.unit_cost_snapshot : 0
            };
        })
    };
    setReceiptData(formattedReceipt);
    setSearchResults([]);
  };

  const getTypeStyles = (type) => {
    switch(type) {
      case 'ISSUANCE': return 'bg-rose-500 text-white';
      case 'RECEIVING': return 'bg-emerald-500 text-white';
      case 'PULL_OUT': return 'bg-amber-500 text-white';
      case 'ISSUANCE_RETURN': return 'bg-sky-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  const getContextualName = (h) => {
    if (h.transaction_mode === 'TRANSMITTAL') {
      return { label: "Dept:", value: h.department || "N/A" };
    }
    if (h.type === 'RECEIVING' || h.type === 'PULL_OUT') {
      return { label: "Supplier:", value: h.supplier || "N/A" };
    }
    if (h.type === 'ISSUANCE' || h.type === 'ISSUANCE_RETURN') {
      return { 
        label: "Student:", 
        value: `${h.student_name || "N/A"} (${h.student_id || "No ID"})` 
      };
    }
    return { label: "Name:", value: h.student_name || h.supplier || "Walk-in / Cash" };
  };

  const handlePrint = () => {
    const printContent = document.getElementById('lookup-receipt-print');
    if (!printContent) return;
    const win = window.open('', '', 'height=800,width=800');
    win.document.write('<html><head><title>Receipt Copy</title>');
    win.document.write('<script src="https://cdn.tailwindcss.com"></script>');
    win.document.write('</head><body>');
    win.document.write(printContent.outerHTML);
    win.document.write('</body></html>');
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  const handleInputChange = (e) => {
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value.toUpperCase();
    setSearchRef(val);
    window.requestAnimationFrame(() => {
      if (input) input.setSelectionRange(start, end);
    });
  };

  return (
    <>
      {/* SEARCH CARD */}
      <div className="card w-full bg-white shadow-xl mt-6 p-6 border border-blue-100">
         <h3 className="card-title text-gray-700 mb-2 text-sm uppercase tracking-wide flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Receipt / BIS Lookup
         </h3>
         <form onSubmit={handleSearch} className="flex flex-col gap-2">
            <LimitedInput 
              type="text" 
              maxLength={50}
              className="input input-sm input-bordered w-full font-mono uppercase" 
              placeholder="ENTER BIS NO. (e.g. 1) or REF-..." 
              value={searchRef}
              onChange={handleInputChange}
            />
            <button type="submit" disabled={loading} className="btn btn-sm btn-outline btn-info w-full">
                {loading ? "Searching..." : "Find Receipt"}
            </button>
         </form>
         {error && <p className="text-xs text-red-500 mt-2 font-bold text-center">{error}</p>}
      </div>

      {/* DISAMBIGUATION MODAL (Wider container and wrap-protection) */}
      {searchResults.length > 0 && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-[9999] backdrop-blur-sm p-4">
          {/* Increased width to max-w-xl (36rem/576px) */}
          <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-blue-500/20 rounded text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-white tracking-tight uppercase text-sm">Select Transaction</h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {searchResults.length} results found for BIS #{searchResults[0][0].bis_number}
                  </p>
                </div>
              </div>
              <button onClick={() => setSearchResults([])} className="text-slate-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              <div className="flex flex-col gap-3 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar pb-6">
                {searchResults.map((group, idx) => {
                  const h = group[0];
                  const context = getContextualName(h);
                  const timestamp = new Date(h.timestamp);
                  
                  return (
                    <button 
                      key={idx} 
                      onClick={() => loadReceipt(group)}
                      aria-label={`View ${h.type} transaction ${h.reference_number}`}
                      className={`group flex flex-col w-full text-left p-4 rounded-xl border transition-all relative shrink-0 ${
                        h.is_voided 
                        ? 'bg-slate-50 border-slate-200 grayscale-[50%] hover:grayscale-0' 
                        : 'bg-white border-slate-100 shadow-sm'
                      } hover:border-blue-600 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md`}
                    >
                      {h.is_voided && (
                          <div 
                            className="absolute inset-0 pointer-events-none opacity-[0.05] rounded-xl" 
                            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 8px)' }}
                          />
                      )}

                      <div className="flex justify-between items-start mb-2 relative z-10">
                        <div className="flex gap-2 items-center">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${getTypeStyles(h.type)}`}>
                            {h.type}
                          </span>
                          {h.is_voided && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-600 text-white uppercase tracking-wider">
                              VOID
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                          {h.reference_number}
                        </span>
                      </div>

                      <div className="space-y-1.5 relative z-10">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-500 uppercase transition-colors shrink-0">{context.label}</span>
                          <span className="text-xs font-bold text-slate-800 truncate">{context.value}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-[11px] text-slate-500 truncate">
                            Encoded by: <span className="font-semibold text-slate-700">{h.staff_name || "Unknown"}</span>
                          </div>
                          {/* whitespace-nowrap added to prevent "item" breaking to next line */}
                          <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors whitespace-nowrap">
                            {group.length} {group.length === 1 ? 'item' : 'items'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 group-hover:border-blue-100 flex justify-between items-end relative z-10 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Transaction Mode</span>
                          <span className="text-xs font-black text-slate-600 uppercase leading-none">{h.transaction_mode || 'N/A'}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-800 leading-none">{timestamp.toLocaleDateString()}</div>
                          <div className="text-[10px] font-medium text-slate-400 mt-1">{timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <button 
                onClick={() => setSearchResults([])} 
                className="btn btn-ghost btn-sm w-full mt-2 text-slate-400 normal-case font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* RECEIPT MODAL */}
      {receiptData && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white p-4 rounded-lg shadow-2xl max-w-2xl w-full relative max-h-[90vh] overflow-y-auto">
            <button 
                onClick={() => setReceiptData(null)}
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-10"
            >✕</button>

            {receiptData.isVoided && (
                <div className="bg-red-100 text-red-600 font-bold text-center p-2 mb-2 border border-red-300">
                    THIS TRANSACTION HAS BEEN VOIDED
                </div>
            )}

            <div className="border border-gray-200 shadow-inner p-2 bg-gray-50 overflow-auto">
                 <PrintLayout data={receiptData} elementId="lookup-receipt-print" />
            </div>

            <div className="flex gap-2 mt-4">
                <button onClick={handlePrint} className="btn btn-primary btn-sm w-full">
                    Print Copy
                </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}