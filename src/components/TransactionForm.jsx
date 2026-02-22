import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useInventory } from "../hooks/useInventory";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import PrintLayout from "./PrintLayout";
import LimitedInput from "./LimitedInput";

export default function TransactionForm({ onSuccess }) {
  const { currentUser } = useAuth();
  const { processTransaction, loading, error } = useInventory();
  const barcodeRef = useRef(null);

  const [isNewItem, setIsNewItem] = useState(null);
  const [isNewStudent, setIsNewStudent] = useState(null); 
  const [isNewSupplier, setIsNewSupplier] = useState(null);

  const [returnLookupRef, setReturnLookupRef] = useState("");
  const [pastTransactionItems, setPastTransactionItems] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [receiptData, setReceiptData] = useState(null);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [availableSuppliers, setAvailableSuppliers] = useState([]);

  // Custom Dropdown State
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [activeSupplierIndex, setActiveSupplierIndex] = useState(-1);

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
    price: "",
    unitCost: "",
    itemName: "",     
    category: "TEXTBOOK", 
    location: "", 
  });
  
  const [successMsg, setSuccessMsg] = useState("");

  // Focus Logic: Re-run when type changes or item added
  useEffect(() => {
    // Only auto-focus barcode if we are NOT in a mode that requires different inputs first
    if (headerData.type && !['RECEIVING', 'PULL_OUT', 'ISSUANCE'].includes(headerData.type) && barcodeRef.current) {
      barcodeRef.current.focus();
    }
  }, [headerData.type, queue]);

    useEffect(() => {
        const fetchStaticData = async () => {
            const { data } = await supabase.from('courses').select('code').order('code');
            if (data) setAvailableCourses(data.map(c => c.code));
        };

        const fetchSuppliers = async () => {
            const { data } = await supabase.from('suppliers').select('name').order('name');
            if (data) setAvailableSuppliers(data.map(s => s.name));
        };

        fetchStaticData();
        fetchSuppliers();

        // ONLY LISTEN TO SPECIFIC TABLES FOR DROPDOWNS
        // Removed 'app_updates' broadcast listener
        const supplierChannel = supabase.channel('tf-supplier-db')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, fetchSuppliers)
            .subscribe();

        const courseChannel = supabase.channel('tf-course-db')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, fetchStaticData)
                .subscribe();
            
        return () => {
            supabase.removeChannel(supplierChannel);
            supabase.removeChannel(courseChannel);
        };
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
        setIsNewItem(false); // Found
        const cost = data.unit_cost || "";
        const price = data.price || "";

        setCurrentScan(prev => ({
          ...prev, 
          barcode: data.barcode,
          itemName: data.name || "", 
          price: price,
          unitCost: cost,
          location: data.location || "",
          accpacCode: data.accpac_code || "",
          qty: 1
        }));
        
        // Intelligent Focus Logic
        setTimeout(() => {
            // 1. If receiving and no cost, go to Cost input
            if (headerData.type === 'RECEIVING' && (!cost || parseFloat(cost) === 0)) {
                document.getElementById('unitCostInput')?.focus();
            } 
            // 2. For all other scenarios (including PULL_OUT or found items), jump to Qty
            else {
                document.getElementById('qtyInput')?.focus();
            }
        }, 50); 

      } else {
        // NOT FOUND
        setIsNewItem(true); 
        setCurrentScan(prev => ({ 
             ...prev, 
             itemName: "", 
             price: "", 
             unitCost: "", 
             location: ""
        })); 
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
        }, 300); 
        return () => clearTimeout(timer);
    } else if (!headerData.studentId) {
        // Automatically clear details if ID is empty/cleared
        setIsNewStudent(null); 
        setHeaderData(prev => ({
          ...prev,
          studentName: "", 
          course: "",
          yearLevel: "" 
        }));
    }
  }, [headerData.studentId, headerData.type]);

  // Validation Effect for Supplier
  useEffect(() => {
    if (['RECEIVING', 'PULL_OUT'].includes(headerData.type)) {
        if (headerData.supplier && headerData.supplier.trim() !== "") {
            // Check against local cached supplier list (case-insensitive)
            const exactMatch = availableSuppliers.find(
                s => s.trim().toUpperCase() === headerData.supplier.trim().toUpperCase()
            );
            if (exactMatch) {
                setIsNewSupplier(false); // Verified
            } else {
                setIsNewSupplier(true);  // No Record
            }
        } else {
            setIsNewSupplier(null); // Empty
        }
    }
  }, [headerData.supplier, headerData.type, availableSuppliers]);

  // Add to Queue & Reset
  const handleAddToQueue = (e) => {
    e.preventDefault();
    
    // GUARD: Only allow adding if barcode exists, item is found, and QTY is > 0
    if (!currentScan.barcode || isNewItem !== false) return;
    if (!currentScan.qty || parseInt(currentScan.qty) <= 0) {
        alert("Quantity must be at least 1.");
        return;
    }

    if (headerData.type === 'ISSUANCE' && isNewStudent !== false) {
        alert("Cannot process Issuance: Student ID not found in records.");
        return;
    }

    if (['RECEIVING', 'PULL_OUT'].includes(headerData.type) && isNewSupplier !== false) {
        alert("Cannot process transaction: Supplier not found in records.");
        return;
    }
    
    setQueue(prev => {
        const existingIndex = prev.findIndex(item => item.barcode === currentScan.barcode);
        
        if (existingIndex > -1) {
            // Update existing row
            const newQueue = [...prev];
            newQueue[existingIndex] = { 
                ...newQueue[existingIndex], 
                qty: parseInt(currentScan.qty), // Set to the new scanned quantity
                unitCost: currentScan.unitCost === "" ? "0" : currentScan.unitCost,
            };
            return newQueue;
        } else {
            // Add new row
            const newItem = { 
              ...currentScan, 
              unitCost: currentScan.unitCost === "" ? "0" : currentScan.unitCost, 
              accpacCode: currentScan.accpacCode, 
              id: Date.now() 
            };
            return [newItem, ...prev];
        }
    });

    // Reset Scanner Input
    setCurrentScan(prev => ({
      ...prev,
      barcode: "",
      qty: 1,
      price: "",
      unitCost: "", 
      itemName: "",
      location: ""
    }));
    
    setIsNewItem(null); 
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
            
            // CRITICAL FIX: Restore internal ID so the backend can find the product even if barcode changed
            product_internal_id: itemToRemove.internalId,

            displayBarcode: itemToRemove.barcode,
            product_name: itemToRemove.itemName,
            displayName: itemToRemove.itemName,
            
            // FIX 1: Restore price data so re-adding doesn't result in NaN
            price: itemToRemove.price, 
            price_snapshot: itemToRemove.price,
            cost_snapshot: itemToRemove.unitCost, 

            // FIX 2: Restore the Reference Number
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

    // Final security guard to prevent bypass
    if (['RECEIVING', 'PULL_OUT'].includes(headerData.type) && isNewSupplier !== false) {
        alert("Cannot finalize: A verified supplier is required.");
        return;
    }
    
    if (headerData.type === 'ISSUANCE' && isNewStudent !== false) {
        alert("Cannot finalize: A verified Student ID is required.");
        return;
    }

    // Prepare data with Uppercase enforcement
    const finalHeaderData = {
        ...headerData,
        studentName: headerData.studentName?.toUpperCase() || "",
        yearLevel: headerData.yearLevel?.toUpperCase() || "",
        course: headerData.course || "", 
        remarks: headerData.remarks || "",
        supplier: headerData.supplier?.toUpperCase().trim() || ""
    };

    const result = await processTransaction(finalHeaderData, queue);
    
    const currentStaffName = currentUser?.full_name || currentUser?.email || "Staff";

    if (result) {
      setReceiptData({
          bisNumber: result.bis, 
          refNumber: result.ref, 
          
          studentName: result.verifiedName || finalHeaderData.studentName,
          course: result.verifiedCourse || finalHeaderData.course,
          yearLevel: result.verifiedYear || finalHeaderData.yearLevel,

          studentId: finalHeaderData.studentId,
          type: finalHeaderData.type,
          transactionMode: finalHeaderData.transactionMode,
          supplier: finalHeaderData.supplier, 
          remarks: finalHeaderData.remarks,   
          staffName: currentStaffName,        
          date: new Date().toLocaleString(),
          items: queue.map(q => ({
            ...q,
            unitCost: q.unitCost 
          }))
      });

      // 2. CLEAR FORM
      setQueue([]); 
      setPastTransactionItems([]);
      setReturnLookupRef("");
      setSuccessMsg(`Transaction Saved. BIS NO: ${result.bis}`);
      
      // Reset Header but keep Type
      setHeaderData(prev => ({
        ...initialHeaderState,    
        type: prev.type,          
        transactionMode: prev.transactionMode 
      }));

      // Reset Scanner
      setIsNewStudent(null);
      setIsNewSupplier(null);
      setCurrentScan({
        barcode: "", qty: 1, price: "", unitCost: "", itemName: "", category: "TEXTBOOK", location: "", 
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
      const input = e.target;
      // 1. Capture current cursor position provided by the browser event
      const cursorStart = input.selectionStart;
      const cursorEnd = input.selectionEnd;

      // 2. Force Uppercase
      const newVal = input.value.toUpperCase();
      
      setCurrentScan(prev => ({ ...prev, barcode: newVal }));
      
      // 3. Restore cursor position after React re-renders
      // requestAnimationFrame ensures this runs after the DOM update
      window.requestAnimationFrame(() => {
          if (input) {
              input.setSelectionRange(cursorStart, cursorEnd);
          }
      });
      
      // If user changes text, reset "New/Found" status immediately
      if (isNewItem !== null) {
          setIsNewItem(null);
      }
  };


  useEffect(() => {
    // If field is cleared (Backspace/Ctrl+A), reset details immediately
    if (!currentScan.barcode.trim()) {
      setIsNewItem(null);
      setCurrentScan(prev => ({
        ...prev,
        itemName: "",
        price: "",
        unitCost: "",
        location: "",
        qty: 1
      }));
      return;
    }

    const timer = setTimeout(() => {
      if (currentScan.barcode.trim()) {
         checkProduct(currentScan.barcode);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [currentScan.barcode]);


  const handleLookupReceipt = async (e) => {
    e.preventDefault();
    if (!returnLookupRef) return;
    setLookupLoading(true);
    
    // Clear list
    setPastTransactionItems([]);
    
    // We expect the user to type the BIS Number (Integer)
    const bisToSearch = parseInt(returnLookupRef.trim());
    if (isNaN(bisToSearch)) {
        alert("Please enter a valid numeric BIS Number.");
        setLookupLoading(false);
        return;
    }

    try {
        // 1. Fetch Original Sales using BIS NUMBER
        // We strictly look for 'ISSUANCE' because we are in the "Return" context
        const { data: salesData, error: salesError } = await supabase
            .from('transactions')
            .select('*')
            .eq('bis_number', bisToSearch)
            .eq('type', 'ISSUANCE') 
            .eq('is_voided', false);

        if (salesError || !salesData || salesData.length === 0) {
            setHeaderData(prev => ({
                ...prev,
                studentName: "",
                studentId: "",
                course: "",
                yearLevel: "",
                remarks: ""
            }));
            setQueue([]); 
            
            alert(`Issuance BIS #${bisToSearch} not found, or transaction was voided.`);
            setLookupLoading(false);
            return;
        }

        // Logic to prevent mixing receipts remains the same, checking ID integrity
        if (queue.length > 0) {
             const activeRef = queue[0].refNumber; 
             const newRef = salesData[0].reference_number;

             if (activeRef && activeRef !== newRef) {
                 alert(`Restricted: You have pending items from another receipt.\n\nPlease complete or clear the current return before switching.`);
                 setLookupLoading(false);
                 return;
             }
        }

        // 2. Fetch existing returns (Check against the internal IDs)
        const saleIds = salesData.map(item => item.id);
        const { data: returnsData } = await supabase
            .from('transactions')
            .select('original_transaction_id, qty')
            .eq('is_voided', false) 
            .in('original_transaction_id', saleIds);

        // 3. Fetch Current Product Names
        const internalIds = salesData.map(s => s.product_internal_id).filter(Boolean);
        let currentProductNames = {};

        if (internalIds.length > 0) {
            const { data: productsData } = await supabase
                .from('products')
                .select('internal_id, name')
                .in('internal_id', internalIds);
            
            if (productsData) {
                productsData.forEach(p => {
                    currentProductNames[p.internal_id] = p.name;
                });
            }
        }

        // 4. Calculate Remaining Qty
        const validItems = salesData.map(saleItem => {
            const alreadyReturnedQty = returnsData
                ?.filter(r => r.original_transaction_id === saleItem.id)
                .reduce((sum, r) => sum + r.qty, 0) || 0;

            const currentlyInQueueQty = queue
                .filter(q => q.originalTransactionId === saleItem.id)
                .reduce((sum, q) => sum + q.qty, 0);

            const remainingQty = saleItem.qty - alreadyReturnedQty - currentlyInQueueQty;

            const currentName = currentProductNames[saleItem.product_internal_id];
            const displayName = currentName || saleItem.product_name_snapshot || saleItem.product_name || "Unknown Item";
            
            const displayBarcode = saleItem.barcode_snapshot || saleItem.product_id || "Unknown ID"; 
            const priceSnapshot = saleItem.price_snapshot !== null ? saleItem.price_snapshot : saleItem.price;
            const costSnapshot = saleItem.unit_cost_snapshot !== null ? saleItem.unit_cost_snapshot : 0;

            return { 
                ...saleItem, 
                displayName,    
                displayBarcode, 
                price_snapshot: priceSnapshot,
                cost_snapshot: costSnapshot, 
                remainingQty 
            };
        }).filter(item => item.remainingQty > 0);

        if (validItems.length === 0) {
            alert("All items in this receipt have already been returned or are currently in your queue.");
        } else {
            setPastTransactionItems(validItems);
            
            if(validItems[0]) {
                const originalId = validItems[0].student_id || "";
                
                let displayStudentName = validItems[0].student_name || "";
                let displayCourse = validItems[0].course || "";
                let displayYear = validItems[0].year_level || "";
                
                if (originalId) {
                    const { data: currentStudent } = await supabase
                        .from('students')
                        .select('name, course, year_level')
                        .eq('student_id', originalId)
                        .maybeSingle();

                    if (currentStudent) {
                        displayStudentName = currentStudent.name;
                        displayCourse = currentStudent.course;
                        displayYear = currentStudent.year_level;
                        setIsNewStudent(false); 
                    } else {
                        setIsNewStudent(true); 
                    }
                }

                setHeaderData(prev => ({
                    ...prev,
                    studentName: displayStudentName,
                    studentId: originalId,
                    course: displayCourse,
                    yearLevel: displayYear,
                    remarks: ""
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
    // GUARD: Disallow if remaining quantity is 0
    if (item.remainingQty <= 0) {
        alert("This item has no remaining quantity to return.");
        return;
    }

    const returnItem = {
        id: Date.now(),
        barcode: item.displayBarcode, 
        itemName: item.displayName,
        internalId: item.product_internal_id, 
        qty: item.remainingQty,
        maxQty: item.remainingQty,
        originalReceiptQty: item.qty,
        price: item.price_snapshot !== undefined ? item.price_snapshot : item.price, 
        unitCost: item.cost_snapshot !== undefined ? item.cost_snapshot : 0,
        originalTransactionId: item.id,
        refNumber: item.reference_number
    };
    setQueue(prev => [...prev, returnItem]);
    setPastTransactionItems(prev => prev.filter(i => i.id !== item.id));
  };


  const handlePrint = () => {
    // We target the ID used inside the PrintLayout component
    const printContent = document.getElementById('printable-receipt');
    
    if (!printContent) return;

    const win = window.open('', '', 'height=800,width=800');
    win.document.write('<html><head><title>Receipt</title>');
    // Simple Tailwind-like reset for printing
    win.document.write('<style>body { font-family: sans-serif; -webkit-print-color-adjust: exact; } table { width: 100%; border-collapse: collapse; } th, td { padding: 4px; } .text-right { text-align: right; } .text-center { text-align: center; } .font-bold { font-weight: bold; } .border { border: 1px solid #000; } .uppercase { text-transform: uppercase; } .grid { display: grid; } .flex { display: flex; } </style>');
    // Load Tailwind CDN for print preview accuracy (optional but helps)
    win.document.write('<script src="https://cdn.tailwindcss.com"></script>');
    win.document.write('</head><body>');
    win.document.write(printContent.outerHTML);
    win.document.write('</body></html>');
    win.document.close();
    
    // Allow styles to load before printing
    setTimeout(() => {
        win.focus();
        win.print();
    }, 500);
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
    setIsNewSupplier(null);
    setIsNewItem(null);
    
    setCurrentScan({
        barcode: "", qty: 1, price: "", unitCost: "", itemName: "", category: "TEXTBOOK", location: "", 
    });
    
    // Intelligent Initial Focus
    setTimeout(() => {
        if (['RECEIVING', 'PULL_OUT'].includes(newType)) {
            document.getElementById('supplierInput')?.focus();
        } else if (newType === 'ISSUANCE') {
            document.getElementById('studentIdInput')?.focus();
        } else if (barcodeRef.current) {
            barcodeRef.current.focus();
        }
    }, 100);
  };

  // Handle manual qty change in queue table (Allows empty string while typing)
  const handleQueueQtyChange = (id, newQty) => {
    setQueue(prev => prev.map(item => {
      if (item.id === id) {
        // Allow empty string so user can delete and retype "50"
        if (newQty === "") return { ...item, qty: "" };

        let finalQty = parseInt(newQty);
        
        // Block NaN (non-numeric input) but allow empty string flow above
        if (isNaN(finalQty)) return item;

        // If it's a return, enforce the limit immediately
        if (item.maxQty && finalQty > item.maxQty) {
           finalQty = item.maxQty;
        }
        
        // We do NOT enforce min(1) here to allow backspacing
        return { ...item, qty: finalQty };
      }
      return item;
    }));
  };

  // Enforce minimums when user leaves the input field
  const handleQueueBlur = (id) => {
      setQueue(prev => prev.map(item => {
          if (item.id === id) {
              // If empty or 0, reset to 1
              if (!item.qty || parseInt(item.qty) < 1) {
                  return { ...item, qty: 1 };
              }
          }
          return item;
      }));
  };

  // Fix for cursor jumping in Supplier Input & Custom Dropdown Logic
  const handleSupplierChange = (e) => {
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    
    // Force Uppercase
    const val = input.value.toUpperCase();
    
    setHeaderData(prev => ({...prev, supplier: val}));

    // Filter suggestions (Starts With logic)
    if (val.trim()) {
        const filtered = availableSuppliers.filter(s => s.startsWith(val));
        setSupplierSuggestions(filtered);
        setShowSupplierDropdown(true);
        setActiveSupplierIndex(0); 
    } else {
        setShowSupplierDropdown(false);
    }

    // Restore cursor position
    window.requestAnimationFrame(() => {
        if (input) {
            input.setSelectionRange(start, end);
        }
    });
  };

  const handleSupplierKeyDown = (e) => {
      if (!showSupplierDropdown || supplierSuggestions.length === 0) return;
      
      if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveSupplierIndex(prev => (prev < supplierSuggestions.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveSupplierIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
          // Only Enter selects the highlighted item
          if (activeSupplierIndex >= 0 && supplierSuggestions[activeSupplierIndex]) {
              e.preventDefault();
              selectSupplier(supplierSuggestions[activeSupplierIndex]);
          } else {
              setShowSupplierDropdown(false);
          }
      } else if (e.key === 'Escape') {
          setShowSupplierDropdown(false);
      }
      // Tab key is deliberately omitted to allow default browser focus navigation
  };

  const selectSupplier = (name) => {
      setHeaderData(prev => ({...prev, supplier: name}));
      setShowSupplierDropdown(false);
  };

  const handleReturnRefChange = (e) => {
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value.toUpperCase();
    
    setReturnLookupRef(val);

    // Restore cursor position after React state update
    window.requestAnimationFrame(() => {
        if (input) {
            input.setSelectionRange(start, end);
        }
    });
  };

  return (
    <div className="card w-full max-w-none bg-base-100 shadow-xl border border-gray-200 p-0 overflow-hidden">
  
    {/* TRANSACTION TYPE SELECTOR - REDESIGN */}
        <div className="p-1.5 bg-slate-100/50 flex border-b border-slate-200">
        {[
            { id: 'RECEIVING', label: 'Receiving' },
            { id: 'ISSUANCE', label: 'Issuance', mode: 'CHARGED' },
            { id: 'ISSUANCE_RETURN', label: 'Return' },
            { id: 'PULL_OUT', label: 'Pull Out' },
        ].map((btn) => (
            <button
            key={btn.id}
            type="button"
            onClick={() => handleSwitchType(btn.id, btn.mode || "")}
            className={`flex-1 py-3 px-2 rounded text-[11px] font-bold uppercase tracking-widest transition-all
                ${headerData.type === btn.id 
                ? "bg-white text-slate-900 shadow-sm border border-slate-300/50" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}
            `}
            >
            {btn.label}
            </button>
        ))}
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
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-400 opacity-20"></div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Transaction Context
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${headerData.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-700' : headerData.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-700' : headerData.type === 'PULL_OUT' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                            {headerData.type}
                        </span>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-3">
                    {!['RECEIVING', 'PULL_OUT'].includes(headerData.type) ? (
                        <>
                            <div className="md:col-span-2">
                                <label className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Student ID</span>
                                    {isNewStudent === true && <span className="text-[9px] font-bold text-rose-500 animate-pulse bg-rose-50 px-1 rounded border border-rose-100">NO RECORD</span>}
                                    {isNewStudent === false && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100 uppercase tracking-tighter">Verified</span>}
                                </label>
                                <LimitedInput 
                                    id="studentIdInput" 
                                    maxLength={50}
                                    className={`w-full h-9 px-3 rounded-lg border text-sm font-mono transition-all outline-none
                                        ${isNewStudent === true ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 focus:border-blue-500'}
                                        ${isNewStudent === false ? 'border-emerald-300 bg-emerald-50/30 text-emerald-900 font-bold' : ''}
                                        ${headerData.type === 'ISSUANCE_RETURN' ? 'bg-slate-100 text-slate-400' : 'bg-white'}
                                    `}
                                    placeholder="Search ID..."
                                    value={headerData.studentId} 
                                    onChange={e => { if(isNewStudent !== null) setIsNewStudent(null); setHeaderData({...headerData, studentId: e.target.value}); }}
                                    readOnly={headerData.type === 'ISSUANCE_RETURN'}
                                />
                            </div>

                            <div className="md:col-span-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Full Name</label>
                                <input 
                                    type="text" disabled={['ISSUANCE', 'ISSUANCE_RETURN'].includes(headerData.type)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold uppercase disabled:text-slate-500"
                                    placeholder="Name will auto-fill"
                                    value={headerData.studentName}
                                    onChange={e => setHeaderData({...headerData, studentName: e.target.value})} 
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Course</label>
                                <select 
                                    disabled={['ISSUANCE', 'ISSUANCE_RETURN'].includes(headerData.type)}
                                    className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold"
                                    value={headerData.course}
                                    onChange={e => setHeaderData({...headerData, course: e.target.value})}
                                >
                                    <option value="">Select...</option>
                                    {availableCourses.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Year/Sem</label>
                                <input 
                                    type="text" disabled={['ISSUANCE', 'ISSUANCE_RETURN'].includes(headerData.type)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs uppercase"
                                    placeholder="Y1S1"
                                    value={headerData.yearLevel}
                                    onChange={e => setHeaderData({...headerData, yearLevel: e.target.value})} 
                                />
                            </div>

                            {headerData.type === 'ISSUANCE' && (
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Trans. Mode</label>
                                    <select className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-blue-700" 
                                        value={headerData.transactionMode} onChange={e => setHeaderData({...headerData, transactionMode: e.target.value})}>
                                        <option value="CHARGED">Charged</option>
                                        <option value="CASH">Cash</option>
                                        <option value="SIP">SIP</option>
                                        <option value="TRANSMITTAL">Transmittal</option>
                                    </select>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="md:col-span-4 relative">
                            <label className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Supplier / Source</span>
                                {isNewSupplier === true && <span className="text-[9px] font-bold text-rose-500 animate-pulse bg-rose-50 px-1 rounded border border-rose-100">NO RECORD</span>}
                                {isNewSupplier === false && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100 uppercase tracking-tighter">Verified</span>}
                            </label>
                            <LimitedInput 
                                id="supplierInput" 
                                maxLength={150}
                                autoComplete="off"
                                className={`w-full h-9 px-3 rounded-lg border text-sm uppercase font-semibold transition-all outline-none
                                    ${isNewSupplier === true ? 'border-rose-300 bg-rose-50/30 text-rose-900' : 'border-slate-200 bg-white focus:border-blue-500'}
                                    ${isNewSupplier === false ? 'border-emerald-300 bg-emerald-50/30 text-emerald-900 font-bold' : ''}
                                `}
                                placeholder="Start typing supplier..."
                                value={headerData.supplier} onChange={handleSupplierChange} onKeyDown={handleSupplierKeyDown}
                                onFocus={() => { if(headerData.supplier) { setSupplierSuggestions(availableSuppliers.filter(s => s.startsWith(headerData.supplier))); setShowSupplierDropdown(true); }}}
                                onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                            />
                            {showSupplierDropdown && supplierSuggestions.length > 0 && (
                                <ul className="absolute z-[100] top-full left-0 right-0 bg-white border border-slate-200 rounded-b-lg shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5 mt-0.5">
                                    {supplierSuggestions.map((sup, index) => (
                                        <li key={index} 
                                            className={`px-4 py-2 text-[11px] cursor-pointer border-b border-slate-50 last:border-0 hover:bg-blue-50 transition-colors ${index === activeSupplierIndex ? 'bg-blue-100 font-bold text-blue-800' : 'text-slate-600'}`}
                                            onMouseDown={() => selectSupplier(sup)}
                                        >
                                            {sup}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    
                    <div className="md:col-span-6 mt-1">
                        <LimitedInput 
                            as="textarea"
                            maxLength={500}
                            showCounter={true}
                            className="w-full h-12 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs italic text-slate-500 focus:bg-white transition-all outline-none resize-none"
                            placeholder="Internal remarks or notes..."
                            value={headerData.remarks} onChange={e => setHeaderData({...headerData, remarks: e.target.value})} 
                        />
                    </div>
                </div>
            </div>

            {/* === SECTION 2: SCANNER OR RECEIPT LOOKUP === */}
            <div className={`p-4 rounded-xl border-2 transition-all duration-300 shadow-md ${isNewItem === true ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-blue-100'}`}>
                
                {headerData.type === 'ISSUANCE_RETURN' ? (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-100 rounded-lg text-sky-800">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                             <span className="text-[10px] font-bold uppercase tracking-wider">Lookup Receipt to enable returns</span>
                        </div>
                        <div className="flex gap-2">
                            <LimitedInput 
                                maxLength={50}
                                autoFocus
                                className="flex-1 h-10 px-4 rounded-lg border border-slate-300 font-mono uppercase text-sm shadow-inner focus:ring-2 focus:ring-blue-500 outline-none w-full" 
                                placeholder="ENTER BIS NO. (e.g. 1)"
                                value={returnLookupRef}
                                onChange={handleReturnRefChange}
                                onKeyDown={(e) => e.key === 'Enter' && handleLookupReceipt(e)}
                            />
                            <button onClick={handleLookupReceipt} className="h-10 px-6 rounded-lg bg-slate-800 text-white text-xs font-bold shadow-lg shrink-0" disabled={lookupLoading}>
                                {lookupLoading ? "SEARCHING..." : "FIND ITEMS"}
                            </button>
                        </div>

                        {/* RESULTS OF LOOKUP: Non-scrolling vertical list */}
                        {pastTransactionItems.length > 0 && (
                            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                                <div className="flex justify-between px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    <span>Item Details</span>
                                    <span className="mr-24">Qty / Price</span>
                                </div>
                                {pastTransactionItems.map(item => (
                                    <div 
                                        key={item.id} 
                                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
                                    >
                                        {/* Left: Product Info */}
                                        <div className="flex-1 min-w-0 pr-4">
                                            <div className="font-bold text-slate-800 text-xs truncate group-hover:text-blue-700" title={item.displayName}>
                                                {item.displayName}
                                            </div>
                                            <div className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.38 2H4.5zm10 5.879V16.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-13a.5.5 0 01.5-.5H11v3.379a1.5 1.5 0 001.5 1.5H14.5z" clipRule="evenodd" /></svg>
                                                {item.displayBarcode}
                                            </div>
                                        </div>

                                        {/* Right: Quantities, Price & Action */}
                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="text-right">
                                                <div className="text-[10px] leading-none mb-1">
                                                    <span className="font-black text-emerald-600 text-xs">{item.remainingQty}</span>
                                                    <span className="text-slate-300 mx-1">/</span>
                                                    <span className="text-slate-500 font-bold">{item.qty}</span>
                                                </div>
                                                <div className="font-mono font-bold text-[11px] text-slate-700">
                                                    ₱{(item.price_snapshot !== undefined ? Number(item.price_snapshot) : Number(item.price)).toFixed(2)}
                                                </div>
                                            </div>
                                            
                                            <button 
                                                onClick={() => handleSelectReturnItem(item)} 
                                                className="h-8 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm active:scale-95 transition-all"
                                            >
                                                Select
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* --- STANDARD SCANNER UI (Receiving/Issuance) --- */
                    <>
                        <div className="grid grid-cols-12 gap-3 mb-3">
                            {/* 1. Barcode Field (Slightly Reduced for Qty) */}
                            <div className="col-span-6">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Barcode</label>
                                <LimitedInput 
                                    maxLength={50}
                                    name="barcodeField" 
                                    as="input" 
                                    ref={barcodeRef} 
                                    type="text" 
                                    className={`w-full h-10 px-3 rounded-lg border-2 font-mono font-bold uppercase outline-none
                                        ${isNewItem === true ? 'border-rose-400 bg-rose-50 text-rose-600' : 
                                        isNewItem === false ? 'border-emerald-400 text-emerald-800' : 'border-slate-200 text-blue-700 focus:border-blue-500'}`}
                                    value={currentScan.barcode} onChange={handleBarcodeChange} onKeyDown={handleKeyDown} placeholder="SCAN..."
                                />
                            </div>

                            {/* 2. Cost / Price */}
                            <div className="col-span-3">
                                {['RECEIVING', 'PULL_OUT'].includes(headerData.type) ? (
                                    <>
                                        <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1 block">Unit Cost</label>
                                        <LimitedInput 
                                            id="unitCostInput" type="number" min="0" step="0.01" maxLength={10}
                                            readOnly={headerData.type !== 'RECEIVING'} 
                                            className="w-full h-10 px-3 rounded-lg border-2 border-orange-100 bg-orange-50 font-mono font-bold text-orange-800 focus:border-orange-400 outline-none"
                                            value={currentScan.unitCost}
                                            onChange={e => setCurrentScan({...currentScan, unitCost: e.target.value})}
                                            onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) ? e.preventDefault() : handleKeyDown(e)}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Price</label>
                                        <div className="h-10 px-3 rounded-lg bg-slate-100 border border-slate-200 flex items-center font-mono font-bold text-slate-600 text-sm">
                                            ₱{Number(currentScan.price || 0).toFixed(2)}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 3. Qty Field (10 Digits) */}
                            <div className="col-span-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block text-center">Qty</label>
                                <LimitedInput 
                                    id="qtyInput" type="number" min="1" maxLength={10}
                                    className={`w-full h-10 px-1 rounded-lg border-2 text-center font-bold text-base outline-none
                                        ${!currentScan.qty || parseInt(currentScan.qty) <= 0 ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white focus:border-blue-500'}`} 
                                    value={currentScan.qty}
                                    onChange={e => setCurrentScan({...currentScan, qty: e.target.value})}
                                    onKeyDown={(e) => ['e', 'E', '+', '-', '.'].includes(e.key) ? e.preventDefault() : handleKeyDown(e)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                            {/* Item Name next to Add Button */}
                            <div className="flex-1 h-10 px-3 rounded-lg bg-slate-100 border border-slate-200 flex items-center overflow-hidden">
                                <span className="text-[10px] font-black text-slate-400 uppercase mr-2 shrink-0">Item:</span>
                                <span className="text-[11px] font-bold text-slate-600 truncate">{currentScan.itemName || "---"}</span>
                            </div>
                            
                            <button 
                                onClick={handleAddToQueue} 
                                disabled={!currentScan.barcode || isNewItem !== false || !currentScan.qty || parseInt(currentScan.qty) <= 0}
                                className="px-8 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black tracking-[0.1em] shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-30 disabled:shadow-none whitespace-nowrap"
                            >
                                ADD TO BATCH
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* === SECTION 3: QUEUE TABLE === */}
            <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-inner min-h-[150px] max-h-[300px] custom-scrollbar">
                <table className="table table-xs w-full table-pin-rows">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="py-3 text-slate-500 tracking-tighter">BARCODE</th>
                            <th className="py-3 text-slate-500 tracking-tighter">QTY</th>
                            {['RECEIVING', 'PULL_OUT'].includes(headerData.type) && <th className="py-3 text-orange-600 tracking-tighter uppercase">Cost</th>}
                            {headerData.type !== 'RECEIVING' && <th className="py-3 text-slate-500 tracking-tighter uppercase">Price</th>}
                            <th className="py-3 text-right text-slate-500"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {queue.length === 0 ? (
                            <tr><td colSpan="5" className="text-center py-12 text-slate-300 italic text-[11px] uppercase tracking-widest">Awaiting Items...</td></tr>
                        ) : (
                            queue.map((item) => (
                                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="font-mono text-slate-600 text-[11px] font-bold">{item.barcode}</td>
                                    <td>
                                        <div className="flex items-center gap-1">
                                            <LimitedInput 
                                                type="number" 
                                                maxLength={10}
                                                className="w-28 h-6 text-center text-xs font-black border border-slate-200 rounded bg-white group-hover:border-blue-300"
                                                value={item.qty} min="1" max={item.maxQty || 9999999999}
                                                onChange={(e) => handleQueueQtyChange(item.id, e.target.value)}
                                                onBlur={() => handleQueueBlur(item.id)}
                                                onKeyDown={(e) => ['e', 'E', '+', '-', '.'].includes(e.key) && e.preventDefault()}
                                            />
                                            {item.maxQty && <span className="text-[9px] font-bold text-slate-400">/{item.maxQty}</span>}
                                        </div>
                                    </td>
                                    {['RECEIVING', 'PULL_OUT'].includes(headerData.type) && (
                                        <td className="font-mono text-[11px] text-orange-700 font-bold">
                                            ₱{Number(item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    )}
                                    {headerData.type !== 'RECEIVING' && (
                                        <td className="font-mono text-[11px] text-slate-700 font-bold">
                                            ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    )}
                                    <td className="text-right pr-4">
                                        <button onClick={() => handleRemoveItem(item.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 rounded-full text-rose-500 transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                        </button>
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
          <div className="bg-white p-4 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            
            {/* RENDER THE SHARED LAYOUT */}
            <div className="border border-gray-200 shadow-inner p-2 bg-gray-50 overflow-auto">
                <PrintLayout data={receiptData} elementId="printable-receipt" />
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex gap-2 mt-4 pt-2 border-t">
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
                    Print Slip
                </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}