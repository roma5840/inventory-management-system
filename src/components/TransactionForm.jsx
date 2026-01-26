import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useInventory } from "../hooks/useInventory";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export default function TransactionForm({ onSuccess }) {
  const { currentUser } = useAuth();
  const { processTransaction, loading, error } = useInventory();
  const barcodeRef = useRef(null);

  const [isNewItem, setIsNewItem] = useState(null);
  const [isNewStudent, setIsNewStudent] = useState(null); 

  const [returnLookupRef, setReturnLookupRef] = useState("");
  const [pastTransactionItems, setPastTransactionItems] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [receiptData, setReceiptData] = useState(null);
  const [availableCourses, setAvailableCourses] = useState([]);

  // GLOBAL HEADER STATE (Applied to all items)
  const initialHeaderState = {
    type: "",
    studentName: "",
    studentId: "",
    course: "",
    yearLevel: "",
    transactionMode: "",
    supplier: "", 
    remarks: "",
    reason: "",       
    referenceNo: "",  
  };
  const [headerData, setHeaderData] = useState(initialHeaderState);

  // QUEUE STATE
  const [queue, setQueue] = useState([]);

  // CURRENT SCAN STATE (The Active Input Line)
  const [currentScan, setCurrentScan] = useState({
    barcode: "",
    qty: 1,
    priceOverride: "",
    unitCost: "",
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

  useEffect(() => {
    const fetchCourses = async () => {
        const { data } = await supabase.from('courses').select('code').order('code');
        if (data) setAvailableCourses(data.map(c => c.code));
    };
    fetchCourses();
  }, []);

  const checkProduct = async (barcodeInput) => {
    const barcodeToSearch = barcodeInput?.trim();
    if (!barcodeToSearch) return;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('internal_id, barcode, name, price, unit_cost, location, accpac_code') 
        .eq('barcode', barcodeToSearch)
        .maybeSingle(); 

      if (data) {
        setIsNewItem(false); 
        setCurrentScan(prev => ({
          ...prev, 
          barcode: data.barcode,
          itemName: data.name || "", 
          priceOverride: data.price || "",
          unitCost: data.unit_cost || "",
          location: data.location || "",
          accpacCode: data.accpac_code || "",
          qty: 1
        }));
        setTimeout(() => document.getElementById('qtyInput')?.focus(), 50); 
      } else {
        // NOT FOUND: STRICT MODE
        setIsNewItem(null); 
        alert("Error: Item not found in database.\nPlease register new products in the Inventory Page.");
        setCurrentScan(prev => ({ ...prev, barcode: "" })); 
        if(barcodeRef.current) barcodeRef.current.focus();
      }
    } catch (err) {
      console.error("Lookup failed", err);
    }
  };

  const checkStudent = async (idInput) => {
    const idToSearch = idInput?.trim();
    if (!idToSearch) {
        setIsNewStudent(null);
        return;
    }

    try {
      const { data, error } = await supabase
        .from('students')
        .select('name, course, year_level')
        .eq('student_id', idToSearch)
        .maybeSingle();

      if (data) {
        setIsNewStudent(false);
        setHeaderData(prev => ({
          ...prev,
          studentName: data.name || "",
          course: data.course || "",
          yearLevel: data.year_level || ""
        }));
      } else {
        setIsNewStudent(true);
        setHeaderData(prev => ({
          ...prev,
          studentName: "", 
          course: "",
          yearLevel: "" 
        }));
      }
    } catch (err) {
      console.error("Student lookup failed", err);
    }
  };

  // Debounce Effect for Student ID
  useEffect(() => {
    // Run for ALL types if a student ID is typed
    if (headerData.type && headerData.studentId) {
        const timer = setTimeout(() => {
            checkStudent(headerData.studentId);
        }, 300); // 300ms Delay
        return () => clearTimeout(timer);
    } else if (!headerData.studentId) {
        setIsNewStudent(null); // Reset if empty
    }
  }, [headerData.studentId, headerData.type]);

  // Add to Queue & Reset
  const handleAddToQueue = (e) => {
    e.preventDefault();
    if (!currentScan.barcode) return;
    
    const newItem = { 
      ...currentScan, 
      priceOverride: currentScan.priceOverride === "" ? "0" : currentScan.priceOverride,
      unitCost: currentScan.unitCost === "" ? "0" : currentScan.unitCost, // Pass Cost
      accpacCode: currentScan.accpacCode, 
      id: Date.now() 
    };

    setQueue(prev => [newItem, ...prev]);

    // Reset for next item
    setCurrentScan(prev => ({
      ...prev,
      barcode: "",
      qty: 1,
      priceOverride: "",
      unitCost: "", // Reset Cost
      itemName: "",
      location: ""
    }));
    
    setIsNewItem(null); 
    
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
    const itemToRemove = queue.find(item => item.id === idToRemove);
    if (!itemToRemove) return;

    // 1. Remove from Queue
    setQueue(prev => prev.filter(item => item.id !== idToRemove));

    // 2. IF RETURN MODE: Restore it back to the "Available to Return" list
    if (headerData.type === 'ISSUANCE_RETURN' && itemToRemove.originalTransactionId) {
        const restoredItem = {
            id: itemToRemove.originalTransactionId,
            product_id: itemToRemove.barcode,
            displayBarcode: itemToRemove.barcode,
            product_name: itemToRemove.itemName,
            displayName: itemToRemove.itemName,
            
            // FIX 1: Restore price data so re-adding doesn't result in NaN
            price: itemToRemove.priceOverride, 
            price_snapshot: itemToRemove.priceOverride,

            // FIX 2: CRITICAL - Restore the Reference Number
            // This ensures if we re-add it to the queue, it still knows which receipt it belongs to.
            reference_number: itemToRemove.refNumber,

            qty: itemToRemove.originalReceiptQty, 
            remainingQty: itemToRemove.maxQty 
        };
        setPastTransactionItems(prev => [...prev, restoredItem]);
    }
  };

  const handleFinalSubmit = async () => {
    setSuccessMsg("");

    // Prepare data with Uppercase enforcement
    const finalHeaderData = {
        ...headerData,
        studentName: headerData.studentName?.toUpperCase() || "",
        yearLevel: headerData.yearLevel?.toUpperCase() || "",
        course: headerData.course || "", 
        remarks: headerData.remarks || ""
    };

    const resultRef = await processTransaction(finalHeaderData, queue);
    
    // Use the variable from the top-level scope
    const currentStaffName = currentUser?.full_name || currentUser?.email || "Staff";

    if (resultRef) {
      // 1. SAVE DATA FOR THE RECEIPT POPUP
      setReceiptData({
          refNumber: resultRef,
          studentName: finalHeaderData.studentName,
          studentId: finalHeaderData.studentId,
          course: finalHeaderData.course,
          yearLevel: finalHeaderData.yearLevel,
          type: finalHeaderData.type,
          transactionMode: finalHeaderData.transactionMode,
          supplier: finalHeaderData.supplier, 
          remarks: finalHeaderData.remarks,   
          staffName: currentStaffName,        
          date: new Date().toLocaleString(),
          items: queue.map(q => ({
            ...q,
            unitCost: q.unitCost // Ensure cost is captured for Receiving/Pull Out
          }))
      });

      // 2. CLEAR FORM
      setQueue([]); 
      setPastTransactionItems([]);
      setReturnLookupRef("");
      setSuccessMsg(`Transaction Saved: ${resultRef}`);
      
      // Reset Header but keep Type
      setHeaderData(prev => ({
        ...initialHeaderState,    
        type: prev.type,          
        transactionMode: prev.transactionMode 
      }));

      // Reset Scanner
      setIsNewStudent(null);
      setCurrentScan({
        barcode: "", qty: 1, priceOverride: "", unitCost: "", itemName: "", category: "TEXTBOOK", location: "", 
      });
      if(barcodeRef.current) barcodeRef.current.focus();

      if (onSuccess) onSuccess();

      // Broadcast update
      await supabase.channel('app_updates').send({
        type: 'broadcast', event: 'inventory_update', payload: {} 
      });
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
      // wait 400ms before searching
      if (currentScan.barcode.trim()) {
         checkProduct(currentScan.barcode);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [currentScan.barcode]);

  const handleLookupReceipt = async (e) => {
    e.preventDefault();
    if (!returnLookupRef) return;
    setLookupLoading(true);
    setPastTransactionItems([]);

    try {
        // 1. Fetch Original Sales
        // Note: We also exclude voided sales, just in case the original issuance was voided.
        const { data: salesData, error: salesError } = await supabase
            .from('transactions')
            .select('*')
            .eq('reference_number', returnLookupRef.trim())
            .eq('is_voided', false)
            .in('type', ['ISSUANCE', 'CHARGED', 'CASH']); 

        if (salesError || !salesData || salesData.length === 0) {
            alert("Receipt not found, valid items not found, or transaction was voided.");
            setLookupLoading(false);
            return;
        }

        if (queue.length > 0) {
             const activeRef = queue[0].refNumber; 
             const newRef = salesData[0].reference_number;

             if (activeRef && activeRef !== newRef) {
                 alert(`Restricted: You have pending items from Receipt #${activeRef}.\n\nPlease complete or clear the current return before switching to Receipt #${newRef}.`);
                 setLookupLoading(false);
                 return;
             }
        }

        // 2. Fetch existing returns (FIX IS HERE)
        const saleIds = salesData.map(item => item.id);
        const { data: returnsData } = await supabase
            .from('transactions')
            .select('original_transaction_id, qty')
            .eq('is_voided', false) // <--- CRITICAL FIX: Don't count voided returns!
            .in('original_transaction_id', saleIds);

        // 3. Calculate Remaining Qty
        const validItems = salesData.map(saleItem => {
            const alreadyReturnedQty = returnsData
                ?.filter(r => r.original_transaction_id === saleItem.id)
                .reduce((sum, r) => sum + r.qty, 0) || 0;

            const currentlyInQueueQty = queue
                .filter(q => q.originalTransactionId === saleItem.id)
                .reduce((sum, q) => sum + q.qty, 0);

            const remainingQty = saleItem.qty - alreadyReturnedQty - currentlyInQueueQty;

            // Map Snapshots
            const displayName = saleItem.product_name_snapshot || saleItem.product_name || "Unknown Item";
            const displayBarcode = saleItem.barcode_snapshot || saleItem.product_id || "Unknown ID"; 
            const priceSnapshot = saleItem.price_snapshot !== null ? saleItem.price_snapshot : saleItem.price;

            return { 
                ...saleItem, 
                displayName,    
                displayBarcode, 
                price_snapshot: priceSnapshot,
                remainingQty 
            };
        }).filter(item => item.remainingQty > 0);

        if (validItems.length === 0) {
            alert("All items in this receipt have already been returned or are currently in your queue.");
        } else {
            setPastTransactionItems(validItems);
            if(validItems[0]) {
                setHeaderData(prev => ({
                    ...prev,
                    studentName: validItems[0].student_name || "",
                    studentId: validItems[0].student_id || "",
                    course: validItems[0].course || "",
                    yearLevel: validItems[0].year_level || "",
                    remarks: validItems[0].remarks || ""
                }));
            }
        }
    } catch (err) {
        console.error(err);
        alert("Error processing lookup.");
    } finally {
        setLookupLoading(false);
    }
  };

  const handleSelectReturnItem = (item) => {
    // Add specific past item to return queue
    const returnItem = {
        id: Date.now(),
        barcode: item.displayBarcode, 
        itemName: item.displayName,
        internalId: item.product_internal_id, 

        qty: item.remainingQty,
        maxQty: item.remainingQty,
        originalReceiptQty: item.qty,
        
        priceOverride: item.price_snapshot !== undefined ? item.price_snapshot : item.price, 
        
        originalTransactionId: item.id,
        
        refNumber: item.reference_number
    };
    setQueue(prev => [...prev, returnItem]);
    setPastTransactionItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handlePrint = () => {
    const printContent = document.getElementById('printable-receipt');
    const win = window.open('', '', 'height=600,width=400');
    win.document.write('<html><head><title>Receipt</title>');
    win.document.write('<style>body { font-family: monospace; padding: 20px; } .text-center { text-align: center; } .text-right { text-align: right; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border-bottom: 1px dashed #000; padding: 5px 0; text-align: left; } .total { border-top: 2px solid #000; font-weight: bold; margin-top: 10px; padding-top: 5px; }</style>');
    win.document.write('</head><body>');
    win.document.write(printContent.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  const handleSwitchType = (newType, newMode = "") => {
    setHeaderData({
        ...initialHeaderState,
        type: newType,
        transactionMode: newMode
    });

    setQueue([]);
    setPastTransactionItems([]);
    setReturnLookupRef("");
    setSuccessMsg("");
    setIsNewStudent(null);
    setIsNewItem(null);
    
    setCurrentScan({
        barcode: "", qty: 1, priceOverride: "", unitCost: "", itemName: "", category: "TEXTBOOK", location: "", 
    });
    
    if(barcodeRef.current) barcodeRef.current.focus();
  };

  // Handle manual qty change in queue table
  const handleQueueQtyChange = (id, newQty) => {
    setQueue(prev => prev.map(item => {
      if (item.id === id) {
        let finalQty = parseInt(newQty) || 0;
        
        // If it's a return, enforce the limit
        if (item.maxQty && finalQty > item.maxQty) {
           // Optional: Alert the user or just clamp the value
           // alert(`Cannot return more than purchased. Max: ${item.maxQty}`);
           finalQty = item.maxQty;
        }
        
        if (finalQty < 1) finalQty = 1;
        return { ...item, qty: finalQty };
      }
      return item;
    }));
  };

  return (
    <div className="card w-full max-w-3xl bg-base-100 shadow-xl m-4 border border-gray-200 p-0 overflow-hidden">
      
      {/* ACTION BUTTON GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 w-full">
        <button 
          type="button"
          onClick={() => handleSwitchType("RECEIVING", "")}
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
          onClick={() => handleSwitchType("ISSUANCE", "CHARGED")}
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
          onClick={() => handleSwitchType("ISSUANCE_RETURN", "")}
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
          onClick={() => handleSwitchType("PULL_OUT", "")}
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
                    <button onClick={() => setHeaderData(initialHeaderState)} className="btn btn-xs btn-ghost text-gray-400">Cancel</button>
                </div>
                
                {/* Dynamic Header Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    
                    {/* STUDENT FIELDS: Hidden for RECEIVING & PULL OUT */}
                    {!['RECEIVING', 'PULL_OUT'].includes(headerData.type) && (
                        <>
                            <div className="form-control">
                                <label className="label text-[10px] font-bold text-gray-500 uppercase flex justify-between">
                                    <span>Student ID Number</span>
                                    {isNewStudent === true && <span className="text-orange-600 animate-pulse">New Record</span>}
                                    {isNewStudent === false && <span className="text-green-600">Found</span>}
                                </label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className={`input input-sm input-bordered w-full font-mono transition-colors
                                            ${isNewStudent === true ? 'border-orange-400 bg-orange-50 focus:border-orange-500' : ''}
                                            ${isNewStudent === false ? 'border-green-500 bg-green-50 text-green-800 font-bold' : ''}
                                            ${headerData.type === 'ISSUANCE_RETURN' ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white'}
                                        `}
                                        placeholder={headerData.type === 'ISSUANCE_RETURN' ? "Auto-filled from Receipt" : "Scan or Type ID..."}
                                        value={headerData.studentId} 
                                        onChange={e => {
                                            if(isNewStudent !== null) setIsNewStudent(null);
                                            setHeaderData({...headerData, studentId: e.target.value});
                                        }}
                                        // STRICT AUDIT: Cannot manually change ID in return mode
                                        readOnly={headerData.type === 'ISSUANCE_RETURN'}
                                        autoFocus={headerData.type !== 'ISSUANCE_RETURN'}
                                    />
                                    {/* Status Icons */}
                                    <div className="absolute right-2 top-1.5">
                                        {isNewStudent === false && (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="form-control">
                                <label className="label text-[10px] font-bold text-gray-500 uppercase">Student Name</label>
                                <input 
                                    type="text" 
                                    disabled={headerData.type === 'ISSUANCE_RETURN' && !headerData.studentId}
                                    className="input input-sm input-bordered bg-white disabled:bg-gray-100 disabled:text-gray-400 uppercase"
                                    placeholder="Enter Name"
                                    value={headerData.studentName}
                                    onChange={e => setHeaderData({...headerData, studentName: e.target.value})} 
                                />
                            </div>

                            {/* Split Course and Year */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="form-control">
                                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Course</label>
                                    <select 
                                        disabled={headerData.type === 'ISSUANCE_RETURN' && !headerData.studentId}
                                        className="select select-sm select-bordered bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                        value={headerData.course}
                                        onChange={e => setHeaderData({...headerData, course: e.target.value})}
                                    >
                                        <option value="">--Select--</option>
                                        {availableCourses.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-control">
                                    <label className="label text-[10px] font-bold text-gray-500 uppercase">Year / Sem</label>
                                    <input 
                                        type="text" 
                                        disabled={headerData.type === 'ISSUANCE_RETURN' && !headerData.studentId}
                                        className="input input-sm input-bordered bg-white disabled:bg-gray-100 disabled:text-gray-400 uppercase"
                                        placeholder="e.g. Y1S2"
                                        value={headerData.yearLevel}
                                        onChange={e => setHeaderData({...headerData, yearLevel: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* SUPPLIER: VISIBLE FOR RECEIVING & PULL_OUT ONLY */}
                    {['RECEIVING', 'PULL_OUT'].includes(headerData.type) && (
                        <div className="form-control">
                            <label className="label text-[10px] font-bold text-gray-500 uppercase">Supplier</label>
                            <input type="text" className="input input-sm input-bordered bg-white" 
                                placeholder="Supplier"
                                value={headerData.supplier} onChange={e => setHeaderData({...headerData, supplier: e.target.value})} />
                        </div>
                    )}
                    
                    {/* TRANS MODE: ISSUANCE ONLY */}
                    {headerData.type === 'ISSUANCE' && (
                        <div className="form-control">
                            <label className="label text-[10px] font-bold text-gray-500 uppercase">Trans. Mode</label>
                            <select className="select select-sm select-bordered bg-white" 
                                value={headerData.transactionMode} onChange={e => setHeaderData({...headerData, transactionMode: e.target.value})}>
                                <option value="CHARGED">Charged</option>
                                <option value="CASH">Cash</option>
                                <option value="SIP">SIP</option>
                                <option value="TRANSMITTAL">Transmittal</option>
                            </select>
                        </div>
                    )}
                    
                    <div className="form-control md:col-span-2">
                        <label className="label text-[10px] font-bold text-gray-500 uppercase">General Remarks</label>
                        <input type="text" 
                             disabled={headerData.type === 'ISSUANCE_RETURN' && !headerData.studentId}
                             className="input input-sm input-bordered bg-white disabled:bg-gray-100 disabled:text-gray-400"
                             placeholder="Remarks"
                             value={headerData.remarks} onChange={e => setHeaderData({...headerData, remarks: e.target.value})} 
                        />
                    </div>
                </div>
            </div>

            {/* === SECTION 2: SCANNER OR RECEIPT LOOKUP === */}
            <div className={`p-4 rounded-lg shadow-sm border transition-colors duration-300 bg-white border-blue-100`}>
                
                {/* --- STRICT RETURN MODE UI --- */}
                {headerData.type === 'ISSUANCE_RETURN' ? (
                    <div className="flex flex-col gap-4">
                        <div className="alert alert-info shadow-sm text-xs">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                             <span><strong>Strict Return Policy:</strong> Enter the Receipt/Reference Number to find items.</span>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                autoFocus
                                className="input input-sm input-bordered flex-1 font-mono uppercase" 
                                placeholder="Enter Reference # (e.g. REF-2025...)"
                                value={returnLookupRef}
                                onChange={(e) => setReturnLookupRef(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleLookupReceipt(e);
                                    }
                                }}
                            />
                            <button onClick={handleLookupReceipt} className="btn btn-sm btn-primary" disabled={lookupLoading}>
                                {lookupLoading ? "Searching..." : "Find Receipt"}
                            </button>
                        </div>

                        {/* Results of Lookup */}
                        {pastTransactionItems.length > 0 && (
                            <div className="overflow-x-auto border rounded bg-gray-50 max-h-40">
                                <table className="table table-xs w-full">
                                    <thead>
                                        <tr className="bg-gray-200 sticky top-0">
                                            <th>Item</th>
                                            <th className="text-center">Avail / Orig</th>
                                            <th className="text-right">Price</th>
                                            <th className="text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pastTransactionItems.map(item => (
                                            <tr key={item.id}>
                                                <td className="max-w-[150px] truncate" title={item.displayName}>
                                                    <div className="font-bold">{item.displayName}</div>
                                                    <div className="text-[10px] text-gray-500">{item.displayBarcode}</div>
                                                </td>
                                                <td className="text-center">
                                                    <span className="font-bold text-green-700">{item.remainingQty}</span> 
                                                    <span className="text-gray-400 mx-1">/</span> 
                                                    {item.qty}
                                                </td>
                                                <td className="text-right font-mono">
                                                    {/* Display correct snapshot price */}
                                                    {(item.price_snapshot !== undefined ? Number(item.price_snapshot) : Number(item.price)).toFixed(2)}
                                                </td>
                                                <td className="text-center">
                                                    <button onClick={() => handleSelectReturnItem(item)} className="btn btn-xs btn-outline btn-error">
                                                        Select
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                    /* --- STANDARD SCANNER UI (Receiving/Issuance) --- */
                    <>
                        <div className="h-6 mb-2">
                             {/* Removed "New Item" Indicator logic - strictly existing items only */}
                            {isNewItem === false && (
                                <span className="text-xs font-bold uppercase tracking-wider text-green-700 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                                    Item Found
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
                                    placeholder="Scan..."
                                    autoFocus
                                />
                            </div>
                            
                            <div className="col-span-3">
                                <label className="label text-[10px] font-bold text-gray-400 uppercase">Item Name</label>
                                <input 
                                    readOnly
                                    className="input input-sm input-bordered w-full bg-gray-100 text-gray-600 focus:outline-none"
                                    value={currentScan.itemName || ""} 
                                    placeholder="..."
                                />
                            </div>

                            {/* COST FIELD: Editable in RECEIVING, Read-Only in PULL_OUT */}
                            {['RECEIVING', 'PULL_OUT'].includes(headerData.type) && (
                                <div className="col-span-2">
                                    <label className="label text-[10px] font-bold text-orange-600 uppercase">Unit Cost</label>
                                    <input 
                                        type="number" min="0" step="0.01"
                                        readOnly={headerData.type !== 'RECEIVING'} // Lock if not Receiving
                                        className={`input input-sm input-bordered w-full font-mono text-orange-800 border-orange-200 
                                            ${headerData.type === 'RECEIVING' ? 'focus:border-orange-500 bg-white' : 'bg-orange-50 cursor-not-allowed'}
                                        `}
                                        value={currentScan.unitCost}
                                        onChange={e => setCurrentScan({...currentScan, unitCost: e.target.value})}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Cost"
                                    />
                                </div>
                            )}

                            {/* PRICE FIELD: Editable in RECEIVING, ReadOnly otherwise */}
                            <div className={['RECEIVING', 'PULL_OUT'].includes(headerData.type) ? "col-span-2" : "col-span-4"}>
                                <label className="label text-[10px] font-bold text-gray-400 uppercase">
                                    {headerData.type === 'RECEIVING' ? "SRP" : "Price"}
                                </label>
                                <input 
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    readOnly={headerData.type !== 'RECEIVING'}
                                    className={`input input-sm input-bordered w-full font-mono ${
                                        headerData.type === 'RECEIVING'
                                            ? 'bg-white border-blue-300 text-blue-800' 
                                            : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                    }`}
                                    value={currentScan.priceOverride}
                                    onChange={e => setCurrentScan({...currentScan, priceOverride: e.target.value})}
                                    onKeyDown={handleKeyDown}
                                    placeholder="0.00"
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
                        </div>
                        {/* Add Button Row - Moved down for cleaner layout */}
                        <div className="mt-2">
                            <button onClick={handleAddToQueue} className="btn btn-sm btn-secondary w-full">
                                ADD TO QUEUE
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* === SECTION 3: QUEUE TABLE === */}
            <div className="flex-1 overflow-auto bg-white border rounded-lg min-h-[150px]">
                <table className="table table-xs w-full table-pin-rows">
                    <thead>
                        <tr className="bg-gray-100">
                            <th>Barcode</th>
                            <th>Qty</th>
                            {['RECEIVING', 'PULL_OUT'].includes(headerData.type) && <th className="text-orange-600">Cost</th>}
                            {headerData.type === 'RECEIVING' ? <th>Price</th> : <th>Price/Loc</th>}
                            <th className="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {queue.length === 0 ? (
                            <tr><td colSpan="5" className="text-center py-8 text-gray-300 italic">Queue is empty. Scan items to add.</td></tr>
                        ) : (
                            queue.map((item, index) => (
                                <tr key={item.id} className="hover">
                                    <td className="font-mono">{item.barcode}</td>
                                    <td>
                                        <input 
                                            type="number" 
                                            className="input input-xs input-bordered w-16 text-center font-bold"
                                            value={item.qty}
                                            min="1"
                                            max={item.maxQty || 999}
                                            onChange={(e) => handleQueueQtyChange(item.id, e.target.value)}
                                        />
                                        {item.maxQty && (
                                            <span className="text-[10px] text-gray-400 ml-1">
                                                / {item.maxQty}
                                            </span>
                                        )}
                                    </td>
                                    
                                    {/* COST COLUMN */}
                                    {['RECEIVING', 'PULL_OUT'].includes(headerData.type) && (
                                        <td className="font-mono text-orange-700">
                                            ₱{Number(item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    )}

                                    <td className="font-mono">
                                        ₱{Number(item.priceOverride).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        {item.location && headerData.type !== 'RECEIVING' && <span className="text-[10px] text-gray-400 ml-2">({item.location})</span>}
                                    </td>
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
      {/* === RECEIPT MODAL === */}
      {receiptData && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full">
            
            {/* THIS SECTION IS WHAT GETS PRINTED */}
            <div id="printable-receipt" className="font-mono text-sm text-gray-800 bg-white p-2">
                <div className="text-center mb-4">
                    <h2 className="font-bold text-lg uppercase">Bookstore System</h2>
                    <p className="text-xs">Official Transaction Record</p>
                    <p className="text-xs mt-1">{receiptData.date}</p>
                </div>

                <div className="border-b-2 border-dashed border-gray-300 pb-2 mb-2 text-xs">
                    <p><strong>Ref #:</strong> {receiptData.refNumber}</p>
                    <p><strong>Type:</strong> {receiptData.type}</p>
                    
                    {/* Transaction Mode (Issuance/Return) */}
                    {['ISSUANCE', 'ISSUANCE_RETURN'].includes(receiptData.type) && receiptData.transactionMode && (
                        <p><strong>Mode:</strong> {receiptData.transactionMode}</p>
                    )}
                    
                    {/* Student Info (Issuance/Return) */}
                    {receiptData.studentName && (
                        <>
                            <p><strong>Student:</strong> {receiptData.studentName}</p>
                            <p><strong>ID:</strong> {receiptData.studentId}</p>
                            <p><strong>Course/Yr:</strong> {receiptData.course} {receiptData.yearLevel}</p>
                        </>
                    )}

                    {/* Supplier Info (Receiving/Pull Out) */}
                    {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) && receiptData.supplier && (
                        <p><strong>Supplier:</strong> {receiptData.supplier}</p>
                    )}

                    {/* Staff Info - Show for ALL types */}
                    <p><strong>Staff:</strong> {receiptData.staffName}</p>

                    {/* Remarks */}
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
                                
                                {/* Cost/Price Columns for Receiving/PullOut */}
                                {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) && (
                                    <>
                                        <td className="text-right">{Number(item.unitCost).toFixed(2)}</td>
                                        <td className="text-right">{Number(item.priceOverride).toFixed(2)}</td>
                                    </>
                                )}

                                <td className="text-right">
                                    {/* Logic: Receiving/PullOut = Cost * Qty, Others = Price * Qty */}
                                    {['RECEIVING', 'PULL_OUT'].includes(receiptData.type) 
                                        ? (item.unitCost * item.qty).toFixed(2)
                                        : (item.priceOverride > 0 
                                            ? (receiptData.type === 'ISSUANCE_RETURN' 
                                                ? `(${(item.priceOverride * item.qty).toFixed(2)})` 
                                                : (item.priceOverride * item.qty).toFixed(2))
                                            : '-')
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div className="mt-4 pt-2 border-t-2 border-gray-800 text-center text-xs">
                     <p>*** END OF TRANSACTION ***</p>
                     <p>System Generated</p>
                </div>
            </div>

            {/* ACTION BUTTONS (Not Printed) */}
            <div className="flex gap-2 mt-6 pt-4 border-t">
                <button 
                    onClick={() => setReceiptData(null)} 
                    className="btn btn-sm btn-ghost flex-1"
                >
                    Close
                </button>
                <button 
                    onClick={handlePrint} 
                    className="btn btn-sm btn-primary flex-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                    </svg>
                    Print Receipt
                </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}