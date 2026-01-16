import { useState, useRef, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";

export default function TransactionForm() {
  const { processTransaction, loading, error } = useInventory();
  const barcodeRef = useRef(null);

  // 1. GLOBAL HEADER STATE (Applied to all items)
  const [headerData, setHeaderData] = useState({
    type: "",
    studentName: "",
    studentId: "",
    transactionMode: "CASH", 
    supplier: "", 
    remarks: "",
    reason: "",       
    referenceNo: "",  
  });

  // 2. QUEUE STATE (The Shopping Cart)
  const [queue, setQueue] = useState([]);

  // 3. CURRENT SCAN STATE (The Active Input Line)
  const [currentScan, setCurrentScan] = useState({
    barcode: "",
    qty: 1,
    priceOverride: "",
    itemName: "",     
    category: "TEXTBOOK", 
    location: "", 
  });
  
  const [successMsg, setSuccessMsg] = useState("");

  // Focus Logic: Always refocus scanner after adding to queue
  useEffect(() => {
    if (headerData.type && barcodeRef.current) {
      barcodeRef.current.focus();
    }
  }, [headerData.type, queue]); // Re-run when type changes or item added

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

  const handleAddToQueue = (e) => {
    e.preventDefault(); // Stop form submit
    
    // Basic Validation
    if (!currentScan.barcode) return;
    if (headerData.type === 'RECEIVING' && !currentScan.priceOverride && !currentScan.itemName) {
      // Logic: In receiving, if it's a new item, we might need price/name. 
      // For now, allow add, but backend might reject if it doesn't exist.
    }

    // Add to Local Queue
    const newItem = { ...currentScan, id: Date.now() }; // Temp ID for React Key
    setQueue(prev => [newItem, ...prev]);

    // Reset Input Fields for next scan
    setCurrentScan(prev => ({
      ...prev,
      barcode: "",
      qty: 1,
      // Keep location/price/name empty? Or keep them if doing batch entry? 
      // Usually clear them:
      priceOverride: "",
      itemName: "",
      location: ""
    }));
  };

  const handleRemoveItem = (idToRemove) => {
    setQueue(prev => prev.filter(item => item.id !== idToRemove));
  };

  const handleFinalSubmit = async () => {
    setSuccessMsg("");
    const success = await processTransaction(headerData, queue);
    
    if (success) {
      setSuccessMsg(`Success: Processed ${queue.length} items.`);
      setQueue([]); // Clear Cart
      // Optional: Clear Header? Usually keep it for next student, but clear if safer.
      // setHeaderData(prev => ({ ...prev, studentName: "", studentId: "" })); 
      
      if(barcodeRef.current) barcodeRef.current.focus();
    }
  };

  // Detect "Enter" key on Scanner Input to trigger AddToQueue
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddToQueue(e);
    }
  };


  return (
    <div className="card w-full max-w-3xl bg-base-100 shadow-xl m-4 border border-gray-200 p-0 overflow-hidden">
      
      {/* ACTION BUTTON GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 w-full">
        <button 
          type="button"
          onClick={() => setHeaderData(prev => ({ ...prev, type: "RECEIVING" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-r border-b hover:bg-green-50
            ${headerData.type === "RECEIVING" ? "bg-green-100 border-b-4 border-b-green-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-green-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <span className="font-bold text-xs uppercase text-green-800 tracking-wider">Receiving</span>
        </button>

        <button 
          type="button"
          onClick={() => setHeaderData(prev => ({ ...prev, type: "ISSUANCE" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-r border-b hover:bg-red-50
            ${headerData.type === "ISSUANCE" ? "bg-red-100 border-b-4 border-b-red-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="font-bold text-xs uppercase text-red-800 tracking-wider">Issuance</span>
        </button>

        <button 
          type="button"
          onClick={() => setHeaderData(prev => ({ ...prev, type: "ISSUANCE_RETURN" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-r border-b hover:bg-blue-50
            ${headerData.type === "ISSUANCE_RETURN" ? "bg-blue-100 border-b-4 border-b-blue-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          <span className="font-bold text-xs uppercase text-blue-800 tracking-wider">Return</span>
        </button>

        <button 
          type="button"
          onClick={() => setHeaderData(prev => ({ ...prev, type: "PULL_OUT" }))}
          className={`p-4 flex flex-col items-center gap-2 transition-all border-b hover:bg-orange-50
            ${headerData.type === "PULL_OUT" ? "bg-orange-100 border-b-4 border-b-orange-600 shadow-inner" : "bg-white"}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-orange-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="font-bold text-xs uppercase text-orange-800 tracking-wider">Pull Out</span>
        </button>
      </div>

      {/* CONDITIONAL FORM AREA */}
      <div className="p-6 bg-slate-50 min-h-[400px] flex flex-col">
        {!headerData.type ? (
          <div className="text-center text-gray-400 py-10">
            <h4 className="text-sm font-bold uppercase tracking-widest mb-1">Awaiting Action</h4>
            <p className="text-xs">Select a transaction type above to begin.</p>
          </div>
        ) : (
          <div className="animate-fade-in-down flex flex-col gap-4 h-full">
            
            {/* === SECTION 1: HEADER (Context) === */}
            <div className="border-b border-gray-200 pb-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-gray-700 uppercase tracking-wide text-sm">
                        {headerData.type.replace('_', ' ')} HEADER
                    </h3>
                    <button onClick={() => setHeaderData(p => ({...p, type: ""}))} className="btn btn-xs btn-ghost text-gray-400">Cancel</button>
                </div>
                
                {/* Dynamic Header Fields */}
                <div className="grid grid-cols-2 gap-3">
                    {headerData.type === 'RECEIVING' && (
                        <div className="form-control">
                            <label className="label text-[10px] font-bold text-gray-500 uppercase">Supplier</label>
                            <input type="text" className="input input-sm input-bordered bg-white" 
                                value={headerData.supplier} onChange={e => setHeaderData({...headerData, supplier: e.target.value})} />
                        </div>
                    )}
                    
                    {headerData.type === 'ISSUANCE' && (
                        <>
                            <div className="form-control">
                                <label className="label text-[10px] font-bold text-gray-500 uppercase">Student Name</label>
                                <input type="text" className="input input-sm input-bordered bg-white" 
                                    value={headerData.studentName} onChange={e => setHeaderData({...headerData, studentName: e.target.value})} />
                            </div>
                            <div className="form-control">
                                <label className="label text-[10px] font-bold text-gray-500 uppercase">Trans. Mode</label>
                                <select className="select select-sm select-bordered bg-white" 
                                    value={headerData.transactionMode} onChange={e => setHeaderData({...headerData, transactionMode: e.target.value})}>
                                    <option value="CASH">Cash</option>
                                    <option value="CHARGED">Charged</option>
                                    <option value="TRANSMITTAL">Transmittal</option>
                                </select>
                            </div>
                        </>
                    )}
                    
                    <div className="form-control">
                        <label className="label text-[10px] font-bold text-gray-500 uppercase">General Remarks</label>
                        <input type="text" className="input input-sm input-bordered bg-white" 
                            value={headerData.remarks} onChange={e => setHeaderData({...headerData, remarks: e.target.value})} />
                    </div>
                </div>
            </div>

            {/* === SECTION 2: SCANNER (Repeater) === */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-100">
                <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                         <label className="label text-[10px] font-bold text-gray-400 uppercase">Barcode (Scan Here)</label>
                         <input 
                            ref={barcodeRef}
                            type="text" 
                            className="input input-sm input-bordered w-full font-mono text-blue-800 font-bold" 
                            value={currentScan.barcode}
                            onChange={e => setCurrentScan({...currentScan, barcode: e.target.value})}
                            onKeyDown={handleKeyDown} 
                            placeholder="ISBN..."
                            autoFocus
                         />
                    </div>
                    <div className="col-span-2">
                         <label className="label text-[10px] font-bold text-gray-400 uppercase">Qty</label>
                         <input 
                            type="number" min="1"
                            className="input input-sm input-bordered w-full" 
                            value={currentScan.qty}
                            onChange={e => setCurrentScan({...currentScan, qty: e.target.value})}
                            onKeyDown={handleKeyDown}
                         />
                    </div>
                    
                    {/* Extra Fields for Receiving (Hidden otherwise) */}
                    {headerData.type === 'RECEIVING' && (
                        <>
                         <div className="col-span-2">
                            <label className="label text-[10px] font-bold text-gray-400 uppercase">Price</label>
                            <input type="number" className="input input-sm input-bordered w-full" placeholder="0.00"
                                value={currentScan.priceOverride} onChange={e => setCurrentScan({...currentScan, priceOverride: e.target.value})} onKeyDown={handleKeyDown}/>
                         </div>
                         <div className="col-span-2">
                            <label className="label text-[10px] font-bold text-gray-400 uppercase">Location</label>
                            <input type="text" className="input input-sm input-bordered w-full" placeholder="Rack..."
                                value={currentScan.location} onChange={e => setCurrentScan({...currentScan, location: e.target.value})} onKeyDown={handleKeyDown}/>
                         </div>
                        </>
                    )}

                    <div className="col-span-2">
                        <button onClick={handleAddToQueue} className="btn btn-sm btn-secondary w-full">
                            ADD +
                        </button>
                    </div>
                </div>
            </div>

            {/* === SECTION 3: QUEUE TABLE === */}
            <div className="flex-1 overflow-auto bg-white border rounded-lg min-h-[150px]">
                <table className="table table-xs w-full table-pin-rows">
                    <thead>
                        <tr className="bg-gray-100">
                            <th>Barcode</th>
                            <th>Qty</th>
                            {headerData.type === 'RECEIVING' && <th>Price/Loc</th>}
                            <th className="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {queue.length === 0 ? (
                            <tr><td colSpan="4" className="text-center py-8 text-gray-300 italic">Queue is empty. Scan items to add.</td></tr>
                        ) : (
                            queue.map((item, index) => (
                                <tr key={item.id} className="hover">
                                    <td className="font-mono">{item.barcode}</td>
                                    <td className="font-bold">{item.qty}</td>
                                    {headerData.type === 'RECEIVING' && (
                                        <td>₱{item.priceOverride} / {item.location}</td>
                                    )}
                                    <td className="text-right">
                                        <button onClick={() => handleRemoveItem(item.id)} className="btn btn-ghost btn-xs text-red-500">x</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* === SECTION 4: FOOTER (Confirm) === */}
            <div className="mt-auto pt-2">
                {error && <div className="alert alert-error text-xs mb-2">{error}</div>}
                {successMsg && <div className="alert alert-success text-xs mb-2">{successMsg}</div>}
                
                <button 
                    onClick={handleFinalSubmit} 
                    disabled={loading || queue.length === 0}
                    className={`btn btn-primary w-full shadow-lg ${loading ? 'loading' : ''}`}
                >
                    {loading ? "Processing Batch..." : `CONFIRM ${queue.length} ITEMS`}
                </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}