import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

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

    try {
      // 1. Fetch Transaction Data
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('reference_number', searchRef.trim());

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
    
    const win = window.open('', '', 'height=600,width=400');
    win.document.write('<html><head><title>Receipt Copy</title>');
    win.document.write('<style>body { font-family: monospace; padding: 20px; } .text-center { text-align: center; } .text-right { text-align: right; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border-bottom: 1px dashed #000; padding: 5px 0; text-align: left; } .void-stamp { border: 2px solid red; color: red; padding: 5px; text-align: center; font-weight: bold; margin-bottom: 10px; }</style>');
    win.document.write('</head><body>');
    win.document.write(printContent.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
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
            <input 
              type="text" 
              className="input input-sm input-bordered w-full font-mono uppercase" 
              placeholder="Enter REF-..." 
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
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
          <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full relative">
            <button 
                onClick={() => setReceiptData(null)}
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            >✕</button>

            {/* PRINTABLE AREA */}
            <div id="lookup-receipt-print" className="font-mono text-sm text-gray-800 bg-white p-2 border border-gray-100 shadow-inner my-4">
                {receiptData.isVoided && (
                    <div className="void-stamp mb-4 border-2 border-red-500 text-red-500 font-bold text-center p-1 uppercase">
                        *** VOIDED TRANSACTION ***
                    </div>
                )}

                <div className="text-center mb-4">
                    <h2 className="font-bold text-lg uppercase">Bookstore System</h2>
                    <p className="text-xs">Transaction Copy</p>
                    <p className="text-xs mt-1">{receiptData.date}</p>
                </div>

                <div className="border-b-2 border-dashed border-gray-300 pb-2 mb-2 text-xs">
                    <p><strong>Ref #:</strong> {receiptData.refNumber}</p>
                    <p><strong>Type:</strong> {receiptData.type}</p>
                    
                    {['ISSUANCE', 'ISSUANCE_RETURN'].includes(receiptData.type) && receiptData.transactionMode && (
                        <p><strong>Mode:</strong> {receiptData.transactionMode}</p>
                    )}

                    {receiptData.studentName && (
                        <>
                            <p><strong>Student:</strong> {receiptData.studentName}</p>
                            <p><strong>ID:</strong> {receiptData.studentId}</p>
                            <p><strong>Course/Yr:</strong> {receiptData.course} {receiptData.yearLevel}</p>
                        </>
                    )}
                    
                    {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) && receiptData.supplier && (
                        <p><strong>Supplier:</strong> {receiptData.supplier}</p>
                    )}

                    {receiptData.staffName && (
                        <p><strong>Staff:</strong> {receiptData.staffName}</p>
                    )}

                    {receiptData.remarks && (
                        <p className="mt-1"><strong>Note:</strong> {receiptData.remarks}</p>
                    )}
                </div>

                <table className="w-full text-xs">
                    <thead>
                        <tr>
                            <th className="text-left pb-1">Item</th>
                            <th className="text-center pb-1">Qty</th>
                            {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) && (
                                <>
                                    <th className="text-right pb-1">Cost</th>
                                    <th className="text-right pb-1">SRP</th>
                                </>
                            )}
                            <th className="text-right pb-1">Amt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {receiptData.items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="py-1">{item.itemName.substring(0, 15)}</td>
                                <td className="text-center">
                                    {receiptData.type === 'ISSUANCE_RETURN' ? `-${item.qty}` : item.qty}
                                </td>
                                
                                {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) && (
                                    <>
                                        <td className="text-right">{Number(item.cost).toFixed(2)}</td>
                                        <td className="text-right">{Number(item.price).toFixed(2)}</td>
                                    </>
                                )}

                                <td className="text-right">
                                     {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) 
                                        ? (item.cost * item.qty).toFixed(2)
                                        : (item.price * item.qty).toFixed(2)
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div className="mt-4 pt-2 border-t-2 border-gray-800 text-center text-xs">
                     <p>*** END OF COPY ***</p>
                </div>
            </div>

            <div className="flex gap-2">
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