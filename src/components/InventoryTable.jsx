import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import Pagination from "./Pagination";
import LimitedInput from "./LimitedInput";
import Toast from "./Toast";

export default function InventoryTable({ lastUpdated }) {
  const { userRole } = useAuth();
  const navigate = useNavigate(); 
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); // Instant UI input
  const [debouncedTerm, setDebouncedTerm] = useState(""); // Delayed query value
  
  // Pagination State
  const ITEMS_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", unitCost: "", minStockLevel: "", accpacCode: "" });
  const [updateLoading, setUpdateLoading] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false); 
  const [importLoading, setImportLoading] = useState(false);
  const [newItemForm, setNewItemForm] = useState({ 
    id: "", 
    accpacCode: "",
    name: "", 
    price: "", 
    unitCost: "0",
    minStockLevel: "10",
    location: "",
    initialStock: "0" 
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Add Toast State
  const [toast, setToast] = useState(null);
  const showToast = (message, subMessage, type = "success") => setToast({ message, subMessage, type });
  const [importResult, setImportResult] = useState(null);

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setCreateLoading(true);

    if (!newItemForm.id || !newItemForm.name) {
        showToast("Validation Error", "Barcode and Name are required.", "error");
        setCreateLoading(false); return;
    }

    const sanitizedId = newItemForm.id.toUpperCase();
    const sanitizedAccPac = newItemForm.accpacCode ? newItemForm.accpacCode.toUpperCase() : null;
    const sanitizedName = newItemForm.name.toUpperCase();
    const sanitizedLocation = newItemForm.location ? newItemForm.location.toUpperCase() : "";

    try {
        const { data: existing } = await supabase
            .from('products')
            .select('barcode, accpac_code')
            .or(`barcode.eq.${sanitizedId},accpac_code.eq.${sanitizedAccPac}`)
            .maybeSingle();
            
        if (existing) {
            showToast("Duplicate Error", existing.barcode === sanitizedId ? "Barcode already exists." : "AccPac Code already exists.", "error");
            setCreateLoading(false); return;
        }

        const { error } = await supabase.from('products').insert({
            barcode: sanitizedId, 
            accpac_code: sanitizedAccPac,
            name: sanitizedName,
            price: Number(newItemForm.price),
            unit_cost: Number(newItemForm.unitCost || 0),
            min_stock_level: Number(newItemForm.minStockLevel),
            current_stock: Number(newItemForm.initialStock), 
            location: sanitizedLocation,
            last_updated: new Date()
        });

        if (error) throw error;

        showToast("Registration Success", `${sanitizedName} added to catalog.`);
        setIsAddModalOpen(false);
        setNewItemForm({ id: "", accpacCode: "", name: "", price: "", unitCost: "0", minStockLevel: "10", location: "", initialStock: "0" });
        fetchInventory();
        
        await supabase.channel('app_updates').send({
          type: 'broadcast', event: 'inventory_update', payload: {} 
        });

    } catch (err) {
        showToast("Failed to register", err.message, "error");
    } finally {
        setCreateLoading(false);
    }
  };


  // Handle Debounce (Only for typing)
  // This updates 'debouncedTerm' 250ms after user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle Fetching (Immediate response to Page or Debounced Term)
    const fetchInventory = async () => {
    setLoading(true);
    
    let query = supabase
        .from('products')
        .select('internal_id, id:barcode, accpac_code, name, price, unit_cost, location, currentStock:current_stock, minStockLevel:min_stock_level', { count: 'exact' });

    if (debouncedTerm.trim()) {
        // FIX: Replace commas with '_' to prevent breaking Supabase .or() syntax
        const safeTerm = debouncedTerm.replace(/,/g, '_');
        query = query.or(`name.ilike.%${safeTerm}%,barcode.ilike.%${safeTerm}%,accpac_code.ilike.%${safeTerm}%`);
    } else {
        query = query.order('name', { ascending: true });
    }

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    
    const { data, count, error } = await query.range(from, to);

    if (error) {
        console.error(error);
    } else {
        setProducts(data || []);
        setTotalCount(count || 0); 
    }
    
    setLoading(false);
    };

    // Effect: Triggers on Search, Page Change, or External Updates
  useEffect(() => {
    fetchInventory();
    
    // Local variables to track burst rate
    let changeCount = 0;
    let burstResetTimer = null;
    let debounceTimer = null;
    
    const channel = supabase.channel('table-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
            
            changeCount++;
            
            // 1. Reset the "burst counter" if silence for 300ms
            if (burstResetTimer) clearTimeout(burstResetTimer);
            burstResetTimer = setTimeout(() => {
                changeCount = 0;
            }, 300);
            
            // 2. Hybrid Logic
            if (changeCount <= 2) {
                // Low traffic: Update immediately (Realtime feel)
                fetchInventory();
            } else {
                // High traffic (Bulk Import): Debounce to prevent freezing
                // CRITICAL FIX: Clear the previous timer so we only fetch once at the END of the burst
                if (debounceTimer) clearTimeout(debounceTimer);
                
                debounceTimer = setTimeout(() => {
                    fetchInventory();
                    changeCount = 0; 
                }, 500);
            }
        })
        .subscribe();

    return () => {
        if (burstResetTimer) clearTimeout(burstResetTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase.removeChannel(channel);
    };
  }, [debouncedTerm, currentPage, lastUpdated]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value); 
    setCurrentPage(1); // Reset to page 1 on search
  }

  const openEditModal = (product) => {
    setEditingProduct(product);
    setEditForm({
        name: product.name,
        price: product.price,
        unitCost: product.unit_cost || 0,
        minStockLevel: product.minStockLevel,
        location: product.location || "",
        accpacCode: product.accpac_code || ""
    });
  };


  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);

    const newPrice = Number(editForm.price);
    const newMinLevel = Number(editForm.minStockLevel);

    if (!editingProduct.id || !editingProduct.id.trim()) {
        showToast("Error", "Barcode is required.", "error");
        setUpdateLoading(false); return;
    }

    try {
        const sanitizedBarcode = editingProduct.id.trim().toUpperCase();
        const sanitizedName = editForm.name.toUpperCase();
        const sanitizedLocation = editForm.location ? editForm.location.toUpperCase() : "";
        const sanitizedAccPac = editForm.accpacCode ? editForm.accpacCode.toUpperCase() : null;

        const { error } = await supabase
            .from('products')
            .update({
                barcode: sanitizedBarcode, 
                name: sanitizedName,
                price: Number(editForm.price),
                unit_cost: Number(editForm.unitCost),
                min_stock_level: Number(editForm.minStockLevel),
                location: sanitizedLocation,
                accpac_code: sanitizedAccPac,
                last_updated: new Date()
            })
            .eq('internal_id', editingProduct.internal_id);

        if (error) throw error;
        
        setEditingProduct(null);
        showToast("Update Successful", "Product details have been saved.");
        fetchInventory();

        await supabase.channel('app_updates').send({
          type: 'broadcast', event: 'inventory_update', payload: {} 
        });

    } catch (err) {
        const msg = err.message.includes("products_barcode_key") ? "Barcode already in use." : 
                    err.message.includes("products_accpac_code_key") ? "AccPac Code already in use." : err.message;
        showToast("Update Failed", msg, "error");
    } finally {
        setUpdateLoading(false);
    }
  };

  const handleDelete = async (product) => {
    if (product.currentStock > 0) return showToast("Delete Blocked", "Stock must be 0 to delete item.", "error");
    
    if(window.confirm(`Are you sure you want to delete "${product.name}" permanently?`)) {
        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('internal_id', product.internal_id);
            
            if (error) throw error;

            fetchInventory();
            showToast("Item Deleted", `${product.name} removed from system.`, "delete");

            await supabase.channel('app_updates').send({
                type: 'broadcast', event: 'inventory_update', payload: {} 
            });
        } catch (error) {
            const msg = error.code === '23503' ? "Item has existing transaction history." : error.message;
            showToast("Delete Failed", msg, "error");
        }
    }
  }

  // *Self-Correction for client-side purely:*
  const generateClientBarcode = () => {
    // High-resolution timestamp + Random 3-digit suffix to prevent collision
    const seq = Date.now(); 
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `SYS-${seq}-${rand}`;
  }

  const handleCSVImport = (e) => {
    e.preventDefault();
    const file = e.target.files[0];
    if (!file) return;

    setImportLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: (chunk) => {
        const lines = chunk.split('\n');
        const headerIndex = lines.findIndex(line => 
            line.toUpperCase().includes('ACCPAC ITEM CODE')
        );
        return headerIndex > -1 ? lines.slice(headerIndex).join('\n') : chunk;
      },
      complete: async (results) => {
        try {
            const rows = results.data;
            if (rows.length === 0) throw new Error("No data found or invalid header.");

            const rawRows = rows.map(r => {
                const keys = Object.keys(r);
                const accpacKey = keys.find(k => k.toUpperCase().includes('ACCPAC ITEM CODE'));
                const descKey = keys.find(k => k.toUpperCase().includes('ITEM DESCRIPTION') || k.toUpperCase().includes('DESCRIPTION'));
                
                const code = r[accpacKey]?.trim().toUpperCase().slice(0, 50);
                const name = r[descKey]?.trim().toUpperCase().slice(0, 300);

                if (!code || !name) return null;
                return { accpac: code, name: name };
            }).filter(Boolean);

            if (rawRows.length === 0) throw new Error("Could not parse columns. Ensure 'ACCPAC ITEM CODE' and 'ITEM DESCRIPTION' headers exist.");

            const uniqueMap = new Map();
            rawRows.forEach(r => uniqueMap.set(r.accpac, r));
            const cleanRows = Array.from(uniqueMap.values());

            const BATCH_SIZE = 200;
            let insertedCount = 0;
            let updatedCount = 0;
            let unchangedCount = 0;

            for (let i = 0; i < cleanRows.length; i += BATCH_SIZE) {
                const batch = cleanRows.slice(i, i + BATCH_SIZE);
                const batchAccPacs = batch.map(r => r.accpac);

                const { data: existingItems, error: fetchError } = await supabase
                    .from('products')
                    .select('internal_id, accpac_code, name')
                    .in('accpac_code', batchAccPacs);

                if (fetchError) throw fetchError;

                const existingMap = new Map();
                existingItems.forEach(item => {
                    if(item.accpac_code) existingMap.set(item.accpac_code.toUpperCase(), item);
                });

                const toInsert = [];
                const toUpdate = [];

                batch.forEach((row, batchIndex) => {
                    const existing = existingMap.get(row.accpac);

                    if (existing) {
                        if (existing.name !== row.name) {
                            toUpdate.push({
                                internal_id: existing.internal_id,
                                name: row.name
                            });
                        } else {
                            unchangedCount++;
                        }
                    } else {
                        const globalIndex = i + batchIndex;
                        const seq = Date.now() + globalIndex; 
                        const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                        
                        toInsert.push({
                            barcode: `SYS-${seq}-${rand}`,
                            accpac_code: row.accpac,
                            name: row.name,
                            price: 0,
                            unit_cost: 0,
                            min_stock_level: 10,
                            current_stock: 0,
                            location: 'N/A',
                            last_updated: new Date()
                        });
                    }
                });

                if (toInsert.length > 0) {
                    const { error } = await supabase.from('products').insert(toInsert);
                    if (error) throw error;
                    insertedCount += toInsert.length;
                }

                if (toUpdate.length > 0) {
                    await Promise.all(toUpdate.map(item => 
                        supabase
                            .from('products')
                            .update({ name: item.name, last_updated: new Date() })
                            .eq('internal_id', item.internal_id)
                    ));
                    updatedCount += toUpdate.length;
                }
            }

            setImportResult({ inserted: insertedCount, updated: updatedCount, unchanged: unchangedCount });
            setIsImportModalOpen(false);
            fetchInventory();

        } catch (err) {
            showToast("Import Failed", err.message, "error");
        } finally {
            setImportLoading(false);
        }
      },
      error: (error) => {
        showToast("Parsing Error", error.message, "error");
        setImportLoading(false);
      }
    });
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-0">
        {/* Header with REGISTER BUTTON */}
        <div className="p-5 border-b flex flex-col md:flex-row justify-between items-center bg-white rounded-t-xl gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Inventory Catalog</h2>
                <p className="text-xs text-slate-500 font-medium">Detailed list of all registered bookstore products</p>
            </div>
              {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsAddModalOpen(true)}
                      className="btn btn-sm btn-primary px-4 normal-case"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1">
                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                      </svg>
                      New Item
                    </button>
                    <button 
                      onClick={() => setIsImportModalOpen(true)}
                      className="btn btn-sm btn-outline btn-ghost border-slate-200 text-slate-600 px-4 normal-case hover:bg-slate-50"
                    >
                      Import CSV
                    </button>
                  </div>
              )}
          </div>
          
          <div className="relative w-full md:w-72">
             <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
             </div>
             <input 
              type="text" 
              placeholder="Search by name, barcode, or code..." 
              className="input input-bordered input-sm w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-all"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
        </div>

        {/* Table - Height and internal scroll removed to allow page-level scrolling */}
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                <th className="bg-slate-50/80">Barcode</th>
                <th className="bg-slate-50/80">AccPac Code</th>
                <th className="bg-slate-50/80">Product Name</th>
                <th className="bg-slate-50/80">Location</th>
                {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="text-right bg-slate-50/80">Cost</th>}
                <th className="text-right bg-slate-50/80">Price</th>
                <th className="text-center bg-slate-50/80">Stock</th>
                <th className="text-center bg-slate-50/80">Status</th>
                {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="bg-slate-50/80"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 && !loading ? (
                <tr><td colSpan="9" className="text-center py-12 text-slate-400 font-medium">No products found matching your search.</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.internal_id || p.id} className="hover:bg-slate-50/50 transition-colors group">
                    {/* Barcode Cell - Handling long custom IDs */}
                    <td className="max-w-[120px]">
                        {['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? (
                            <button 
                                onClick={() => navigate(`/product/${p.internal_id}`)}
                                className="font-mono text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 whitespace-normal break-all text-left"
                            >
                                {p.id}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                  <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                        ) : (
                            <span className="font-mono text-[11px] text-slate-500 break-all">{p.id}</span>
                        )}
                    </td>
                    
                    {/* AccPac Code Cell */}
                    <td className="max-w-[100px]">
                        {p.accpac_code ? (
                            <span className="font-mono text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded break-all inline-block">
                                {p.accpac_code}
                            </span>
                        ) : (
                            <span className="text-slate-300">—</span>
                        )}
                    </td>

                    {/* Product Name */}
                    <td className="min-w-[180px] max-w-[300px]">
                      <div className="font-medium text-slate-700 whitespace-normal break-all leading-tight">
                        {p.name}
                      </div>
                    </td>

                    {/* Location Cell */}
                    <td className="max-w-[120px]">
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-500 whitespace-normal break-all leading-tight">
                        {p.location || "N/A"}
                      </span>
                    </td>
                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                        <td className="text-right font-mono text-xs text-slate-500">
                          ₱{p.unit_cost?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                    )}
                    <td className="text-right font-mono text-sm font-semibold text-slate-700">
                      ₱{p.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-center">
                      <span className={`text-sm font-bold ${p.currentStock <= p.minStockLevel ? 'text-rose-600' : 'text-slate-700'}`}>
                        {p.currentStock}
                      </span>
                    </td>
                    {/* TABLE STATUS CELL */}
                    <td className="text-center">
                    {p.currentStock <= 0 ? (
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                        Out of Stock
                        </span>
                    ) : p.currentStock <= p.minStockLevel ? (
                        <span className="text-[10px] font-black uppercase text-slate-900 tracking-tighter">
                        Critical Level
                        </span>
                    ) : (
                        <span className="text-[10px] font-black uppercase text-slate-300 tracking-tighter">
                        Stock Stable
                        </span>
                    )}
                    </td>
                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                      <td className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditModal(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors tooltip tooltip-left" data-tip="Edit Product">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>
                            <button onClick={() => handleDelete(p)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors tooltip tooltip-left" data-tip="Delete Product">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <Pagination 
            totalCount={totalCount}
            itemsPerPage={ITEMS_PER_PAGE}
            currentPage={currentPage}
            onPageChange={(p) => setCurrentPage(p)}
            loading={loading}
        />
        
        {/* EDIT MODAL (Pop-up) */}
      {editingProduct && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-gray-700 mb-4">
                Update Item Details
            </h3>
            
            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
                
                {/* Barcode & Stock Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Barcode / ISBN *</label>
                        <div className="flex gap-1">
                            <LimitedInput 
                                type="text" 
                                maxLength={50}
                                showCounter={true}
                                value={editingProduct.id} 
                                onChange={(e) => setEditingProduct({...editingProduct, id: e.target.value})}
                                className="input input-bordered input-sm font-mono font-bold text-blue-800 uppercase w-full" 
                                required
                            />
                            <button type="button" 
                                onClick={() => setEditingProduct({...editingProduct, id: generateClientBarcode()})}
                                className="btn btn-square btn-outline btn-primary btn-sm shrink-0" 
                                title="Generate New ID"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-400">Current Stock</label>
                        <input type="text" value={editingProduct.currentStock} disabled className="input input-bordered input-sm bg-gray-100 font-bold text-gray-700" />
                        <label className="label text-[10px] text-orange-500">
                            *Stock cannot be edited here. Use Transaction Form.
                        </label>
                    </div>
                </div>

                {/* EDITABLE FIELDS */}
                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Item Name *</label>
                    <LimitedInput 
                        type="text" 
                        maxLength={300}
                        showCounter={true}
                        className="input input-bordered w-full uppercase" 
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        required
                    />
                </div>

                {/* AccPac Field in Edit Mode */}
                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">AccPac Code</label>
                    <LimitedInput 
                        type="text" 
                        maxLength={50}
                        showCounter={true}
                        className="input input-bordered w-full font-mono text-blue-900 uppercase" 
                        placeholder="Optional"
                        value={editForm.accpacCode}
                        onChange={e => setEditForm({...editForm, accpacCode: e.target.value})}
                    />
                </div>

                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Location / Rack</label>
                    <LimitedInput 
                        type="text" 
                        maxLength={150}
                        showCounter={true}
                        className="input input-bordered w-full uppercase" 
                        value={editForm.location}
                        onChange={e => setEditForm({...editForm, location: e.target.value})}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Price (₱) *</label>
                        <LimitedInput 
                            type="number" 
                            step="0.01"
                            min="0"
                            maxLength={10}
                            className="input input-bordered w-full" 
                            value={editForm.price}
                            onChange={e => setEditForm({...editForm, price: e.target.value})}
                            onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                            required
                        />
                    </div>
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Min. Stock Alert Level *</label>
                        <LimitedInput 
                            type="number" 
                            min="0"
                            step="1"
                            maxLength={10}
                            className="input input-bordered w-full" 
                            value={editForm.minStockLevel}
                            onChange={e => setEditForm({...editForm, minStockLevel: e.target.value})}
                            onKeyDown={(e) => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()}
                            required
                        />
                    </div>
                </div>

                <div className="modal-action">
                    <button type="button" className="btn btn-ghost" onClick={() => setEditingProduct(null)}>Cancel</button>
                    <button type="submit" className={`btn btn-primary ${updateLoading ? 'loading' : ''}`}>
                        {updateLoading ? "Updating..." : "Save Changes"}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* === REGISTER NEW ITEM MODAL === */}
      {isAddModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-gray-700 mb-4">
                Register New Product
            </h3>
            
            <form onSubmit={handleCreateProduct} className="flex flex-col gap-3">
                
                {/* Barcode & AccPac Row */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Barcode *</label>
                        <div className="flex gap-1">
                            <LimitedInput 
                                type="text" 
                                maxLength={50}
                                showCounter={true}
                                className="input input-bordered w-full font-mono font-bold text-blue-800 uppercase" 
                                placeholder="Scan/Type"
                                value={newItemForm.id}
                                onChange={e => setNewItemForm({...newItemForm, id: e.target.value})}
                                required
                            />
                            <button type="button" 
                                onClick={() => setNewItemForm({...newItemForm, id: generateClientBarcode()})}
                                className="btn btn-square btn-outline btn-primary btn-sm shrink-0" 
                                title="Generate ID"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">AccPac Code</label>
                        <LimitedInput 
                            type="text" 
                            maxLength={50}
                            showCounter={true}
                            className="input input-bordered w-full font-mono text-gray-700 uppercase" 
                            placeholder="Optional"
                            value={newItemForm.accpacCode}
                            onChange={e => setNewItemForm({...newItemForm, accpacCode: e.target.value})}
                        />
                    </div>
                </div>

                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Item Name *</label>
                    <LimitedInput 
                        type="text" 
                        maxLength={300}
                        showCounter={true}
                        className="input input-bordered w-full uppercase" 
                        placeholder="Product Title"
                        value={newItemForm.name}
                        onChange={e => setNewItemForm({...newItemForm, name: e.target.value})}
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Price (₱) *</label>
                        <LimitedInput 
                            type="number" step="0.01" min="0" maxLength={10}
                            className="input input-bordered w-full" 
                            value={newItemForm.price}
                            onChange={e => setNewItemForm({...newItemForm, price: e.target.value})}
                            onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                            required
                        />
                    </div>
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Location</label>
                        <LimitedInput 
                            type="text" 
                            maxLength={150}
                            showCounter={true}
                            className="input input-bordered w-full uppercase" 
                            placeholder="Rack/Shelf"
                            value={newItemForm.location}
                            onChange={e => setNewItemForm({...newItemForm, location: e.target.value})}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Initial Stock</label>
                        <LimitedInput 
                            type="number" min="0" step="1" maxLength={10}
                            className="input input-bordered w-full" 
                            value={newItemForm.initialStock}
                            onChange={e => setNewItemForm({...newItemForm, initialStock: e.target.value})}
                            onKeyDown={(e) => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()}
                        />
                    </div>
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Min. Stock Alert Level *</label>
                        <LimitedInput 
                            type="number" 
                            min="0"
                            step="1"
                            maxLength={10}
                            className="input input-bordered w-full" 
                            value={newItemForm.minStockLevel}
                            onChange={e => setNewItemForm({...newItemForm, minStockLevel: e.target.value})}
                            onKeyDown={(e) => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()}
                            required
                        />
                    </div>
                </div>

                <div className="modal-action">
                    <button type="button" className="btn btn-ghost" onClick={() => {
                        setIsAddModalOpen(false);
                        setNewItemForm({ id: "", accpacCode: "", name: "", price: "", unitCost: "0", minStockLevel: "10", location: "", initialStock: "0" });
                    }}>Cancel</button>
                    <button type="submit" className={`btn btn-primary ${createLoading ? 'loading' : ''}`}>
                        Register Item
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box relative">
            {importLoading ? (
               <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                  <div className="text-center">
                    <h3 className="font-bold text-lg text-gray-700">Importing Data...</h3>
                    <p className="text-sm text-gray-500">Please do not close this window.</p>
                  </div>
               </div>
            ) : (
               <>
                <h3 className="font-bold text-lg text-gray-700 mb-4">Import AccPac CSV</h3>
                <p className="text-xs text-gray-500 mb-4">
                    CSV Format must contain headers: <strong>ACCPAC ITEM CODE, ITEM DESCRIPTION</strong><br/>
                    Existing codes will be updated. New items will receive generated barcodes.
                </p>
                
                <input 
                    type="file" 
                    accept=".csv"
                    onChange={handleCSVImport}
                    className="file-input file-input-bordered w-full file-input-sm 
                               file:bg-blue-600 file:text-white file:border-none hover:file:bg-blue-700 transition-all" 
                />

                <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setIsImportModalOpen(false)}>Cancel</button>
                </div>
               </>
            )}
          </div>
        </div>
      )}

      {importResult && (
        <div className="modal modal-open">
            <div className="modal-box max-w-sm text-center p-8 border border-slate-200 shadow-2xl">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 className="font-bold text-xl text-slate-800">Import Successful</h3>
                <p className="text-sm text-slate-500 mb-6">Catalog updated with AccPac data.</p>
                
                <div className="grid grid-cols-3 gap-2 mb-8">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-emerald-600">{importResult.inserted}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">New</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-blue-600">{importResult.updated}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Updated</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="text-xl font-bold text-slate-400">{importResult.unchanged}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Match</div>
                    </div>
                </div>

                <button onClick={() => setImportResult(null)} className="btn btn-primary w-full shadow-lg">Done</button>
            </div>
        </div>
      )}
      {/* Toast and Modal Endings */}
      {toast && (
        <Toast 
          message={toast.message} 
          subMessage={toast.subMessage} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      </div>
    </div>
  );
}