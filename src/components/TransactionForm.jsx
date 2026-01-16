import { useState, useRef, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";

export default function TransactionForm() {
  const { processTransaction, loading, error } = useInventory();
  
  const barcodeRef = useRef(null);

  const [formData, setFormData] = useState({
    barcode: "",
    qty: 1,
    type: "",
    studentName: "",
    studentId: "",
    transactionMode: "CASH", 
    supplier: "", 
    remarks: "",
    priceOverride: "",
    reason: "",       
    referenceNo: "",  
    itemName: "",     
    category: "TEXTBOOK", 
    location: "",     
  });
  
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (formData.type && barcodeRef.current) {
      barcodeRef.current.focus();
    }
  }, [formData.type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg("");

    const success = await processTransaction(formData);

    if (success) {
      setSuccessMsg(`Success: ${formData.type} processed.`);
      setFormData(prev => ({ 
        ...prev, 
        barcode: "", 
        qty: 1, 
        studentName: "", 
        studentId: "", 
        remarks: "", 
        priceOverride: "",
        itemName: "",
        location: ""
      })); 
      
      if(barcodeRef.current) barcodeRef.current.focus();
    }
  };

  return (
    <div className="card w-full max-w-3xl bg-base-100 shadow-xl m-4 border border-gray-200 p-0 overflow-hidden">
      
      {/* ACTION BUTTON GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 w-full">
        <button 
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, type: "RECEIVING" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-r border-b hover:bg-green-50
            ${formData.type === "RECEIVING" ? "bg-green-100 border-b-4 border-b-green-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-green-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <span className="font-bold text-xs uppercase text-green-800 tracking-wider">Receiving</span>
        </button>

        <button 
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, type: "ISSUANCE" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-r border-b hover:bg-red-50
            ${formData.type === "ISSUANCE" ? "bg-red-100 border-b-4 border-b-red-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="font-bold text-xs uppercase text-red-800 tracking-wider">Issuance</span>
        </button>

        <button 
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, type: "ISSUANCE_RETURN" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-r border-b hover:bg-blue-50
            ${formData.type === "ISSUANCE_RETURN" ? "bg-blue-100 border-b-4 border-b-blue-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          <span className="font-bold text-xs uppercase text-blue-800 tracking-wider">Return</span>
        </button>

        <button 
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, type: "PULL_OUT" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-b hover:bg-orange-50
            ${formData.type === "PULL_OUT" ? "bg-orange-100 border-b-4 border-b-orange-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-orange-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="font-bold text-xs uppercase text-orange-800 tracking-wider">Pull Out</span>
        </button>
      </div>

      {/* CONDITIONAL FORM AREA */}
      <div className="p-6 bg-slate-50 min-h-[200px] flex flex-col justify-center">
        {!formData.type ? (
          <div className="text-center text-gray-400">
            <h4 className="text-sm font-bold uppercase tracking-widest mb-1">Awaiting Action</h4>
            <p className="text-xs">Select a transaction type above to begin.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 animate-fade-in-down">
            <div className="flex justify-between items-center mb-2 border-b border-gray-200 pb-2">
               <h3 className="font-bold text-gray-700 uppercase tracking-wide text-sm">
                 {formData.type.replace('_', ' ')}
               </h3>
               <button type="button" onClick={() => setFormData(p => ({...p, type: ""}))} className="btn btn-xs btn-ghost text-gray-400">
                 Cancel
               </button>
            </div>

            {/* === RECEIVING MODULE (Includes PRODUCT MANAGER Logic) === */}
            {formData.type === 'RECEIVING' && (
              <div className="bg-green-50 p-3 rounded-lg border border-green-100 flex flex-col gap-3">
                <div className="alert alert-info shadow-sm text-xs py-2">
                  <span>If item is NEW, fill out Name/Category below. If existing, just scan Barcode.</span>
                </div>
                
                {/* Supplier & Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-control">
                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Supplier</label>
                    <input type="text" className="input input-sm input-bordered bg-white" placeholder="e.g. Rex" 
                      value={formData.supplier || ""} onChange={(e) => setFormData({...formData, supplier: e.target.value})} />
                  </div>
                  <div className="form-control">
                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Price (Update/New)</label>
                    <input type="number" step="0.01" className="input input-sm input-bordered bg-white" placeholder="0.00" 
                      value={formData.priceOverride || ""} onChange={(e) => setFormData({...formData, priceOverride: e.target.value})} />
                  </div>
                </div>

                {/* NEW ITEM / EDIT DETAILS SECTION */}
                <div className="grid grid-cols-2 gap-3 border-t border-green-200 pt-2">
                   <div className="form-control col-span-2">
                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Item Name (New Items Only)</label>
                    <input type="text" className="input input-sm input-bordered bg-white" placeholder="Title / Description..." 
                      value={formData.itemName || ""} onChange={(e) => setFormData({...formData, itemName: e.target.value})} />
                  </div>
                  <div className="form-control">
                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Category</label>
                    <select className="select select-sm select-bordered bg-white" 
                      value={formData.category || "TEXTBOOK"} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                      <option value="TEXTBOOK">Textbook</option>
                      <option value="UNIFORM">Uniform</option>
                      <option value="MERCH">Merchandise</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="form-control">
                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Rack / Location</label>
                    <input type="text" className="input input-sm input-bordered bg-white" placeholder="e.g. Rack A-1" 
                      value={formData.location || ""} onChange={(e) => setFormData({...formData, location: e.target.value})} />
                  </div>
                </div>
              </div>
            )}

            {/* === ISSUANCE MODULE === */}
            {formData.type === 'ISSUANCE' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-red-50 p-3 rounded-lg border border-red-100">
                 <div className="form-control">
                  <label className="label text-[10px] font-bold text-gray-500 uppercase">Student ID</label>
                  <input type="text" className="input input-sm input-bordered bg-white" 
                    value={formData.studentId || ""} onChange={(e) => setFormData({...formData, studentId: e.target.value})} />
                </div>
                <div className="form-control">
                  <label className="label text-[10px] font-bold text-gray-500 uppercase">Student Name</label>
                  <input type="text" className="input input-sm input-bordered bg-white" 
                    value={formData.studentName || ""} onChange={(e) => setFormData({...formData, studentName: e.target.value})} />
                </div>
                <div className="form-control">
                  <label className="label text-[10px] font-bold text-gray-500 uppercase">Trans. Mode</label>
                  <select className="select select-sm select-bordered bg-white" value={formData.transactionMode || "CASH"} 
                    onChange={(e) => setFormData({...formData, transactionMode: e.target.value})}>
                    <option value="CASH">Cash</option>
                    <option value="CHARGED">Charged</option>
                    <option value="TRANSMITTAL">Transmittal</option>
                    <option value="SIP">SIP / Scholar</option>
                  </select>
                </div>
              </div>
            )}

            {/* === RETURN & PULL OUT MODULE === */}
            {(formData.type === 'ISSUANCE_RETURN' || formData.type === 'PULL_OUT') && (
              <div className={`grid grid-cols-2 gap-3 p-3 rounded-lg border ${formData.type === 'PULL_OUT' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'}`}>
                <div className="form-control">
                  <label className="label text-[10px] font-bold text-gray-500 uppercase">Reason</label>
                  <select className="select select-sm select-bordered bg-white" 
                    value={formData.reason || ""} onChange={(e) => setFormData({...formData, reason: e.target.value})}>
                    <option value="" disabled>Select Reason</option>
                    <option value="DAMAGED">Damaged / Defective</option>
                    <option value="WRONG_ITEM">Wrong Item</option>
                    <option value="OVERSTOCK">Overstock (Pull Out)</option>
                    <option value="DROPPED">Dropped Subject (Return)</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label text-[10px] font-bold text-gray-500 uppercase">Ref No. / Gate Pass</label>
                  <input type="text" className="input input-sm input-bordered bg-white" placeholder="Doc Ref #" 
                    value={formData.referenceNo || ""} onChange={(e) => setFormData({...formData, referenceNo: e.target.value})} />
                </div>
              </div>
            )}

            {/* === CORE SCANNER === */}
            <div className="form-control">
              <label className="label text-xs font-bold text-gray-500 uppercase">Scan Barcode / ISBN</label>
              <input 
                ref={barcodeRef}
                type="text" 
                placeholder="Focus here & Scan..." 
                className="input input-bordered w-full font-mono text-lg" 
                value={formData.barcode}
                onChange={(e) => setFormData({...formData, barcode: e.target.value})}
                autoFocus
                required
              />
            </div>

            <div className="flex gap-4">
               <div className="form-control w-1/3">
                <label className="label text-xs font-bold text-gray-500 uppercase">Qty</label>
                <input type="number" min="1" className="input input-bordered w-full text-lg" 
                  value={formData.qty} onChange={(e) => setFormData({...formData, qty: e.target.value})} required />
              </div>
              <div className="form-control w-2/3">
                <label className="label text-xs font-bold text-gray-500 uppercase">General Remarks</label>
                <input type="text" className="input input-bordered w-full" placeholder="Notes..." 
                  value={formData.remarks || ""} onChange={(e) => setFormData({...formData, remarks: e.target.value})} />
              </div>
            </div>

            {error && <div className="alert alert-error text-sm shadow-lg rounded-md">{error}</div>}
            {successMsg && <div className="alert alert-success text-sm shadow-lg rounded-md">{successMsg}</div>}

            <button type="submit" className={`btn btn-primary btn-lg w-full mt-2 shadow-md ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? "Processing..." : `CONFIRM ${formData.type.replace('_', ' ')}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}