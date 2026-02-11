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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchRef.trim()) return;
    
    setLoading(true);
    setError("");
    setReceiptData(null);
    
    // Force Uppercase
    const term = searchRef.trim().toUpperCase();

    try {
      // 1. Fetch Transaction Data
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('reference_number', term);

      if (error) throw error;

      if (!data || data.length === 0) {
        setError("Reference number not found.");
      } else {
        // Filter out 'VOID' entries (reversals) to avoid duplicates in the UI
        // We prefer showing the original items (which are likely marked is_voided=true)
        const displayItems = data.filter(item => item.type !== 'VOID');
        const finalItems = displayItems.length > 0 ? displayItems : data;

        const header = finalItems[0];
        
        // 2. Fetch Staff Name (Resolve User ID -> Full Name)
        let resolvedStaffName = "Unknown Staff";
        if (header.user_id) {
            const { data: userData } = await supabase
                .from('authorized_users')
                .select('full_name')
                .eq('auth_uid', header.user_id)
                .maybeSingle();
            
            if (userData?.full_name) {
                resolvedStaffName = userData.full_name;
            }
        }

        const isVoided = data.some(d => d.is_voided);

        const formattedReceipt = {
          refNumber: header.reference_number,
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
          items: finalItems.map(item => ({
             itemName: item.product_name_snapshot || item.product_name,
             qty: item.qty,
             price: item.price_snapshot !== null ? item.price_snapshot : 0,
             cost: item.unit_cost_snapshot !== null ? item.unit_cost_snapshot : 0
          }))
        };
        setReceiptData(formattedReceipt);
      }
    } catch (err) {
      console.error(err);
      setError("Error retrieving data.");
    } finally {
      setLoading(false);
    }
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
        win.print();
    }, 500);
  };

  const handleInputChange = (e) => {
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value.toUpperCase();
    
    setSearchRef(val);

    // Restore cursor position after React update
    window.requestAnimationFrame(() => {
      if (input) {
        input.setSelectionRange(start, end);
      }
    });
  };

  return (
    <>
      {/* 1. THE SEARCH CARD */}
      <div className="card w-full bg-white shadow-xl mt-6 p-6 border border-blue-100">
         <h3 className="card-title text-gray-700 mb-2 text-sm uppercase tracking-wide flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Receipt Lookup
         </h3>
         <form onSubmit={handleSearch} className="flex flex-col gap-2">
            <LimitedInput 
              type="text" 
              maxLength={50}
              className="input input-sm input-bordered w-full font-mono uppercase" 
              placeholder="Enter REF-..." 
              value={searchRef}
              onChange={handleInputChange}
            />
            <button type="submit" disabled={loading} className="btn btn-sm btn-outline btn-info w-full">
                {loading ? "Searching..." : "Find Receipt"}
            </button>
         </form>
         {error && <p className="text-xs text-red-500 mt-2 font-bold text-center">{error}</p>}
      </div>

      {/* 2. THE MODAL */}
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

            {/* PRINTABLE AREA */}
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