import { useState, useRef, useEffect } from "react";
import { useInventory } from "../hooks/useInventory";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function TransactionForm() {
  const { processTransaction, loading, error } = useInventory();
  const barcodeRef = useRef(null);

  const [isNewItem, setIsNewItem] = useState(null);


  // GLOBAL HEADER STATE (Applied to all items)
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

  // QUEUE STATE
  const [queue, setQueue] = useState([]);

  // CURRENT SCAN STATE (The Active Input Line)
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

  

  const checkProduct = async (barcodeInput) => {
    const barcodeToSearch = barcodeInput?.trim();
    if (!barcodeToSearch) return;

    try {
      const docRef = doc(db, "products", barcodeToSearch);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // FOUND: Populate fields, Lock Name Field
        setIsNewItem(false); 
        setCurrentScan(prev => ({
          ...prev, 
          barcode: barcodeToSearch,
          itemName: data.name || "", 
          priceOverride: data.price || "", 
          location: data.location || "",
          category: data.category || "TEXTBOOK",
          qty: 1 // Always reset to 1 on fresh scan
        }));
        
        // Auto-Focus Qty Field
        setTimeout(() => document.getElementById('qtyInput')?.focus(), 50); 

      } else {
        // NOT FOUND: Clear fields, Unlock Name Field
        setIsNewItem(true); 
        setCurrentScan(prev => ({
            ...prev,
            barcode: barcodeToSearch,
            itemName: "", // Clear name so they can type
            priceOverride: "",
            location: "",
            qty: 1
        }));
        
        // Auto-Focus Name Field for manual entry
        setTimeout(() => document.getElementById('nameInput')?.focus(), 50);
      }
    } catch (err) {
      console.error("Lookup failed", err);
    }
  };



  // Add to Queue & Reset
  const handleAddToQueue = (e) => {
    e.preventDefault();
    if (!currentScan.barcode) return;
    
    const newItem = { ...currentScan, id: Date.now() };
    setQueue(prev => [newItem, ...prev]);

    // Reset for next item
    setCurrentScan(prev => ({
      ...prev,
      barcode: "",
      qty: 1,
      priceOverride: "",
      itemName: "",
      location: ""
    }));
    
    setIsNewItem(null); // Reset to Unknown status
    
    // Refocus scanner
    if(barcodeRef.current) barcodeRef.current.focus();
  };


  // Handle Enter Key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // If pressing Enter on Barcode (eg. Scanner), force immediate check
      if (e.target.name === 'barcodeField') {
        checkProduct(currentScan.barcode); 
      } 
      // If pressing Enter on Name/Qty, add to cart
      else {
        handleAddToQueue(e);
      }
    }
  };



  const handleRemoveItem = (idToRemove) => {
    setQueue(prev => prev.filter(item => item.id !== idToRemove));
  };

  const handleFinalSubmit = async () => {
    setSuccessMsg("");
    // Use headerData and queue state
    const success = await processTransaction(headerData, queue);
    
    if (success) {
      setSuccessMsg(`Success: Processed ${queue.length} items.`);
      setQueue([]); 
      // Reset scanner focus
      if(barcodeRef.current) barcodeRef.current.focus();
    }
  };




  // Reset status when user manually types in barcode field
  const handleBarcodeChange = (e) => {
      const newVal = e.target.value;
      setCurrentScan(prev => ({ ...prev, barcode: newVal }));
      
      // If user changes text, reset "New/Found" status immediately
      // This ensures we don't show old data while they are typing a new barcode
      if (isNewItem !== null) {
          setIsNewItem(null);
      }
  };



useEffect(() => {
    const timer = setTimeout(() => {
      // Only search if barcode exists and we haven't already locked onto a status
      // wait 250ms before searching
      if (currentScan.barcode.trim()) {
         checkProduct(currentScan.barcode);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [currentScan.barcode]);


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
            <div className={`p-4 rounded-lg shadow-sm border transition-colors duration-300 
                ${isNewItem === true ? 'bg-yellow-50 border-yellow-200' : 
                  isNewItem === false ? 'bg-green-50 border-green-200' : 'bg-white border-blue-100'}`}>
                
                {/* Visual Indicator - Only shows AFTER lookup */}
                <div className="h-6 mb-2">
                    {isNewItem === true && (
                        <span className="text-xs font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1 animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                            New Item Entry
                        </span>
                    )}
                    {isNewItem === false && (
                        <span className="text-xs font-bold uppercase tracking-wider text-green-700 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                            Existing Item Found
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                         <label className="label text-[10px] font-bold text-gray-400 uppercase">Barcode</label>
                         <input 
                            name="barcodeField"
                            ref={barcodeRef}
                            type="text" 
                            className="input input-sm input-bordered w-full font-mono text-blue-800 font-bold" 
                            value={currentScan.barcode}
                            onChange={handleBarcodeChange} 
                            onKeyDown={handleKeyDown} 
                            placeholder="ISBN..."
                            autoFocus
                         />
                    </div>
                    
                    {/* Item Name */}
                    <div className="col-span-4">
                         <label className="label text-[10px] font-bold text-gray-400 uppercase">Item Name</label>
                         <input 
                            id="nameInput"
                            type="text"
                            readOnly={isNewItem !== true}
                            className={`input input-sm input-bordered w-full font-bold transition-all
                                ${isNewItem === true 
                                    ? 'bg-white border-orange-500 ring-2 ring-orange-100 text-gray-900' 
                                    : 'bg-gray-100 text-gray-600 focus:outline-none'
                                }
                            `}
                            value={currentScan.itemName || ""} 
                            onChange={e => setCurrentScan({...currentScan, itemName: e.target.value})}
                            onKeyDown={handleKeyDown}
                            placeholder={isNewItem === true ? "Enter New Title..." : "..."}
                            autoComplete="off"
                         />
                    </div>

                    <div className="col-span-2">
                         <label className="label text-[10px] font-bold text-gray-400 uppercase">Qty</label>
                         <input 
                            id="qtyInput"
                            type="number" min="1"
                            className="input input-sm input-bordered w-full" 
                            value={currentScan.qty}
                            onChange={e => setCurrentScan({...currentScan, qty: e.target.value})}
                            onKeyDown={handleKeyDown}
                         />
                    </div>
                    
                    {/* Price - Always visible, but read-only unless New Item or Receiving */}
                    <div className="col-span-2">
                        <label className="label text-[10px] font-bold text-gray-400 uppercase">Price</label>
                        <input 
                            type="number" 
                            className={`input input-sm input-bordered w-full ${isNewItem !== true && headerData.type !== 'RECEIVING' ? 'bg-gray-100' : 'bg-white'}`}
                            placeholder="0.00"
                            readOnly={isNewItem !== true && headerData.type !== 'RECEIVING'}
                            value={currentScan.priceOverride} 
                            onChange={e => setCurrentScan({...currentScan, priceOverride: e.target.value})} 
                            onKeyDown={handleKeyDown}
                        />
                    </div>

                    <div className="col-span-1">
                        <button onClick={handleAddToQueue} className="btn btn-sm btn-secondary w-full">
                            ADD
                        </button>
                    </div>
                </div>
                
                {/* Location - Shown for Receiving OR New Items */}
                {(headerData.type === 'RECEIVING' || isNewItem === true) && (
                     <div className="mt-2">
                        <input type="text" className="input input-xs input-bordered w-1/3" placeholder="Location / Rack Number"
                            value={currentScan.location} onChange={e => setCurrentScan({...currentScan, location: e.target.value})} />
                     </div>
                )}
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