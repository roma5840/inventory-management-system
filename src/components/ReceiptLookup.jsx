import { useState } from "react";
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

  const handleSearch = async (e) => {
    e.preventDefault();
    const term = searchRef.trim().toUpperCase();
    if (!term) return;
    
    setLoading(true);
    setError("");
    setReceiptData(null);
    setSearchResults([]); // Clear previous disambiguation list
    
    try {
      let query = supabase.from('transactions').select('*');
      
      // LOGIC: If input is numeric -> Search BIS. If alphanumeric -> Search Reference #
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

      // Filter out 'VOID' entries (reversals), but keep original lines (even if voided)
      const cleanData = data.filter(item => item.type !== 'VOID');

      // GROUP ITEMS BY REFERENCE NUMBER (To distinguish Issuance #1 from Receiving #1)
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
           // Only one receipt found
           await loadReceipt(groups[0]);
      } else {
           // Multiple receipts found with same BIS (e.g. Issuance #1 and Receiving #1)
           setSearchResults(groups);
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

    // Fetch Staff Name
    let resolvedStaffName = "Unknown Staff";
    if (header.user_id) {
        const { data: userData } = await supabase
            .from('authorized_users')
            .select('full_name')
            .eq('auth_uid', header.user_id)
            .maybeSingle();
        if (userData?.full_name) resolvedStaffName = userData.full_name;
    }

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
        staffName: resolvedStaffName,
        remarks: header.remarks,
        isVoided: isVoided,
        voidReason: header.void_reason,
        items: items.map(item => ({
            itemName: item.product_name_snapshot || item.product_name,
            qty: item.qty,
            price: item.price_snapshot !== null ? item.price_snapshot : 0,
            cost: item.unit_cost_snapshot !== null ? item.unit_cost_snapshot : 0
        }))
    };
    setReceiptData(formattedReceipt);
    setSearchResults([]); // Clear selection list if any
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
    setTimeout(() => {
        win.focus();
        win.print();
    }, 500);
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

      {/* DISAMBIGUATION LIST (If multiple found) */}
      {searchResults.length > 0 && (
         <div className="card w-full bg-white shadow-lg mt-2 p-2 border border-slate-200">
             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Select Transaction</div>
             <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                 {searchResults.map((group, idx) => {
                     const h = group[0];
                     return (
                         <button 
                             key={idx} 
                             onClick={() => loadReceipt(group)}
                             className="text-left px-3 py-2 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-all group"
                         >
                             <div className="flex justify-between items-center">
                                 <span className="font-bold text-xs text-slate-700">BIS #{h.bis_number} - {h.type}</span>
                                 <span className="text-[10px] text-slate-400">{new Date(h.timestamp).toLocaleDateString()}</span>
                             </div>
                             <div className="text-[10px] text-slate-500 truncate">
                                 {h.student_name || h.supplier || "No Name"}
                             </div>
                         </button>
                     )
                 })}
             </div>
         </div>
      )}

      {/* MODAL */}
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