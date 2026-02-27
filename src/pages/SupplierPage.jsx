import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import Papa from "papaparse";
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";
import LimitedInput from "../components/LimitedInput";
import Toast from "../components/Toast";
import DeleteModal from "../components/DeleteModal";

export default function SupplierPage() {
  const { userRole } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Import State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Edit State
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editName, setEditName] = useState("");
  const [editContact, setEditContact] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const [toast, setToast] = useState(null);
  const showToast = (message, subMessage, type = "success") => setToast({ message, subMessage, type });
  
  const [deletingSupplier, setDeletingSupplier] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Debounce Search Term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchSuppliers = async () => {
    setLoading(true);
    let query = supabase.from('suppliers').select('*', { count: 'exact' });

    if (debouncedTerm.trim()) {
        const safeTerm = debouncedTerm.replace(/,/g, '_');
        query = query.or(`name.ilike.%${safeTerm}%,contact_info.ilike.%${safeTerm}%`);
    } else {
        query = query.order('name', { ascending: true });
    }

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, count, error } = await query.range(from, to);

    if (!error) {
        setSuppliers(data || []);
        setTotalCount(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();

    let changeCount = 0;
    let burstResetTimer = null;
    let debounceTimer = null;

    const dbChannel = supabase.channel('supplier-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
            changeCount++;

            if (burstResetTimer) clearTimeout(burstResetTimer);
            burstResetTimer = setTimeout(() => { changeCount = 0; }, 300);

            if (changeCount <= 2) {
                fetchSuppliers();
            } else {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    fetchSuppliers();
                    changeCount = 0;
                }, 500);
            }
        })
        .subscribe();

    return () => {
        if (burstResetTimer) clearTimeout(burstResetTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase.removeChannel(dbChannel);
    };
  }, [debouncedTerm, currentPage]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleDownloadTemplate = () => {
    const csvContent = Papa.unparse({
      fields: ["INFO", "SUPPLIER"],
      data: [
        ["S-M0003", "101 MEGA BEAUTY EFFECTS CORPORATION"],
        ["S-G0002", "2GO GROUP, INC."]
      ]
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", "supplier_import_template.csv");
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
            line.toUpperCase().includes('SUPPLIER') || 
            line.toUpperCase().includes('INFO')
        );
        return headerIndex > -1 ? lines.slice(headerIndex).join('\n') : chunk;
      },
      complete: async (results) => {
        try {
            const rows = results.data;
            if (rows.length === 0) throw new Error("No data found or invalid header.");

            const validationErrors = [];

            const sanitize = (str) => {
                if (typeof str !== 'string') return str !== undefined && str !== null ? String(str).trim() : null;
                const clean = str.trim();
                return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
            };

            const rawRows = rows.map((r, index) => {
                const keys = Object.keys(r);
                const getVal = (search) => {
                    const key = keys.find(k => k.toUpperCase().includes(search));
                    return key ? sanitize(r[key]) : null;
                };

                let rawName = getVal('SUPPLIER');
                const name = (!rawName || rawName.toUpperCase() === '#N/A' || rawName.toUpperCase() === 'N/A') ? null : rawName.toUpperCase();
                
                let rawInfo = getVal('INFO');
                const contact_info = (!rawInfo || rawInfo.toUpperCase() === '#N/A' || rawInfo.toUpperCase() === 'N/A') ? null : rawInfo;

                const rowId = name || `Row ${index + 2}`;
                let rowValid = true;

                if (!name) {
                    validationErrors.push(`[${rowId}] Missing Supplier Name. Row Skipped.`);
                    rowValid = false;
                } else if (name.length > 150) {
                    validationErrors.push(`[${rowId}] Name exceeds 150 characters.`);
                    rowValid = false;
                }
                if (contact_info && contact_info.length > 300) {
                    validationErrors.push(`[${rowId}] Info/Contact exceeds 300 characters.`);
                    rowValid = false;
                }

                if (!rowValid) return null;
                return { name, contact_info };
            }).filter(Boolean);

            if (rawRows.length === 0 && validationErrors.length === 0) {
                throw new Error("Could not parse columns. Ensure 'SUPPLIER' header exists.");
            }

            const uniqueMap = new Map();
            rawRows.forEach((r) => {
                if (uniqueMap.has(r.name)) {
                    const existing = uniqueMap.get(r.name);
                    if (!existing.contact_info && r.contact_info) existing.contact_info = r.contact_info;
                    uniqueMap.set(r.name, existing);
                    validationErrors.push(`[${r.name}] CSV Duplicate Merged.`);
                } else {
                    uniqueMap.set(r.name, r);
                }
            });

            const cleanRows = Array.from(uniqueMap.values());
            const BATCH_SIZE = 300;
            let insertedCount = 0;
            let updatedCount = 0;
            let unchangedCount = 0;
            const processErrors = [...validationErrors];

            for (let i = 0; i < cleanRows.length; i += BATCH_SIZE) {
                const batch = cleanRows.slice(i, i + BATCH_SIZE);
                const batchNames = batch.map(r => r.name).filter(Boolean);

                let existingItems = [];
                if (batchNames.length > 0) {
                    const { data, error } = await supabase.from('suppliers').select('*').in('name', batchNames);
                    if (error) throw error;
                    if (data) existingItems.push(...data);
                }

                const existingByName = new Map();
                existingItems.forEach(item => existingByName.set(item.name.toUpperCase(), item));

                const toInsert = [];
                const toUpdate = [];

                batch.forEach((row) => {
                    const existing = existingByName.get(row.name);

                    if (existing) {
                        let needsUpdate = false;
                        const updatePayload = { id: existing.id };

                        if (row.contact_info && existing.contact_info !== row.contact_info) {
                            needsUpdate = true;
                            updatePayload.contact_info = row.contact_info;
                            if (existing.contact_info) {
                                processErrors.push(`[${row.name}] Info updated from '${existing.contact_info}' to '${row.contact_info}'`);
                            }
                        }

                        if (needsUpdate) {
                            toUpdate.push(updatePayload);
                        } else {
                            unchangedCount++;
                        }
                    } else {
                        toInsert.push({
                            name: row.name,
                            contact_info: row.contact_info || null
                        });
                    }
                });

                if (toInsert.length > 0) {
                    const { error: insError } = await supabase.from('suppliers').insert(toInsert);
                    if (insError) {
                        for (const item of toInsert) {
                            const { error: singleErr } = await supabase.from('suppliers').insert(item);
                            if (singleErr) {
                                processErrors.push(`[${item.name}] Insert Failed: ${singleErr.message}`);
                            } else {
                                insertedCount++;
                            }
                        }
                    } else {
                        insertedCount += toInsert.length;
                    }
                }

                if (toUpdate.length > 0) {
                    const updatePromises = toUpdate.map(async (item) => {
                        const { id, ...fieldsToUpdate } = item;
                        const { error } = await supabase.from('suppliers').update(fieldsToUpdate).eq('id', id);
                        if (error) throw new Error(`[${item.name || 'Update'}] Failed: ${error.message}`);
                        return true;
                    });

                    const results = await Promise.allSettled(updatePromises);
                    results.forEach(res => {
                        if (res.status === 'fulfilled') {
                            updatedCount++;
                        } else {
                            processErrors.push(res.reason.message);
                        }
                    });
                }
            }

            setImportResult({ 
                inserted: insertedCount, 
                updated: updatedCount, 
                unchanged: unchangedCount,
                errors: processErrors 
            });
            setIsImportModalOpen(false);
            fetchSuppliers();

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

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('suppliers').insert([{
        name: newName.trim().toUpperCase(),
        contact_info: newContact.trim()
      }]);

      if (error) {
        if (error.code === '23505') showToast("Duplicate Error", "Supplier already exists.", "error");
        else throw error;
      } else {
        setNewName("");
        setNewContact("");
        showToast("Supplier Registered", "New vendor added to the system.");
        
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });

        fetchSuppliers();
      }
    } catch (err) {
      showToast("Registration Failed", err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (supplier) => {
    setEditingSupplier(supplier);
    setEditName(supplier.name);
    setEditContact(supplier.contact_info || "");
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingSupplier || !editName.trim()) return;
    setIsSaving(true);

    try {
        const { error } = await supabase
            .from('suppliers')
            .update({
                name: editName.trim().toUpperCase(),
                contact_info: editContact.trim()
            })
            .eq('id', editingSupplier.id);

        if (error) {
            if (error.code === '23505') showToast("Update Error", "Supplier name already exists.", "error");
            else throw error;
        } else {
            showToast("Update Successful", "Supplier details updated.");
            await supabase.channel('app_updates').send({
                type: 'broadcast', event: 'inventory_update', payload: {} 
            });

            setEditingSupplier(null);
            fetchSuppliers();
        }
    } catch (err) {
        showToast("Update Failed", err.message, "error");
    } finally {
        setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingSupplier?.id) return;
    setDeleteLoading(true);
    try {
        const { error } = await supabase.from('suppliers').delete().eq('id', deletingSupplier.id);
        if (error) throw error;
        
        showToast("Supplier Removed", `${deletingSupplier.name} deleted successfully.`, "delete");
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });
        
        setDeletingSupplier(null);
        fetchSuppliers();
    } catch (err) {
        const msg = err.code === '23503' ? "Cannot delete supplier with active transaction history." : err.message;
        showToast("Delete Failed", msg, "error");
    } finally {
        setDeleteLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1200px] mx-auto w-full">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suppliers</h1>
                <p className="text-sm text-slate-500">Manage vendor profiles for inventory receiving and procurement.</p>
            </div>

            <div className="card bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">

            {/* Action Bar (Search & Import) */}
            <div className="p-5 border-b flex flex-col md:flex-row justify-between items-center bg-white gap-4">
                <div className="relative w-full md:w-80">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search supplier name or info..." 
                        className="input input-bordered input-sm w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                        value={searchTerm}
                        onChange={handleSearch}
                    />
                </div>

                {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                    <div className="flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={handleDownloadTemplate}
                            className="btn btn-sm btn-outline btn-ghost border-slate-200 text-slate-600 px-4 normal-case hover:bg-slate-50 flex-1 md:flex-none"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Template
                        </button>
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="btn btn-sm btn-outline btn-ghost border-slate-200 text-slate-600 px-4 normal-case hover:bg-slate-50 flex-1 md:flex-none"
                        >
                            Import CSV
                        </button>
                    </div>
                )}
            </div>


            {/* Add Form - Only for Admins */}
            {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
            <div className="p-6 bg-white border-b">
                <h3 className="text-sm font-bold text-gray-600 mb-4 uppercase tracking-wider">Add New Supplier</h3>
                <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="form-control md:col-span-5 w-full">
                        <label className="label">
                            <span className="label-text text-xs font-bold text-gray-500 uppercase">Supplier Name</span>
                        </label>
                        <LimitedInput 
                            type="text" required 
                            maxLength={150}
                            showCounter={true}
                            className="input input-bordered w-full uppercase focus:ring-2 focus:ring-primary/20" 
                            placeholder="SUPPLIER NAME"
                            value={newName} onChange={e => setNewName(e.target.value)}
                        />
                    </div>
                    <div className="form-control md:col-span-5 w-full">
                        <label className="label">
                            <span className="label-text text-xs font-bold text-gray-500 uppercase">Contact Info (Optional)</span>
                        </label>
                        <LimitedInput 
                            type="text" 
                            maxLength={300}
                            showCounter={true}
                            className="input input-bordered w-full focus:ring-2 focus:ring-primary/20" 
                            placeholder="Phone, Email, or Address"
                            value={newContact} onChange={e => setNewContact(e.target.value)}
                        />
                    </div>
                    <div className="md:col-span-2 w-full">
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full shadow-md">
                            {isSubmitting ? "Saving..." : "Add Supplier"}
                        </button>
                    </div>
                </form>
            </div>
            )}

            {/* List */}
            <div className="overflow-x-auto min-h-[400px]">
                <table className="table w-full">
                    <thead className="bg-gray-100">
                        <tr>
                            <th>Name</th>
                            <th>Contact Info</th>
                            {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="text-right">Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                             <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? "3" : "2"} className="text-center py-12 text-slate-400 font-medium"><span className="loading loading-spinner loading-md text-primary"></span></td></tr>
                        ) : suppliers.length === 0 ? (
                             <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? "3" : "2"} className="text-center py-12 text-slate-400 font-medium italic">No suppliers found in the database.</td></tr>
                        ) : (
                            suppliers.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="font-bold text-slate-700 py-4 max-w-[200px]">
                                        <div className="break-all whitespace-normal leading-tight">
                                            {s.name}
                                        </div>
                                    </td>
                                    <td className="text-slate-500 text-sm max-w-[250px]">
                                        <div className="break-all whitespace-normal">
                                            {s.contact_info || <span className="text-slate-300 italic">—</span>}
                                        </div>
                                    </td>
                                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                                    <td className="text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleEditClick(s)} 
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors tooltip tooltip-left"
                                                data-tip="Edit Supplier"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </svg>
                                            </button>
                                            <button 
                                                onClick={() => setDeletingSupplier(s)} 
                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors tooltip tooltip-left"
                                                data-tip="Delete Supplier"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
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
            </div>
        </div>
      </main>
      {/* Edit Modal */}
      {editingSupplier && (
        <div className="modal modal-open backdrop-blur-sm">
            <div className="modal-box border border-slate-200 shadow-2xl">
                <div className="flex justify-between items-center border-b pb-4 mb-6">
                    <h3 className="font-black text-xl text-gray-800 uppercase tracking-tight">Edit Supplier Details</h3>
                    <button onClick={() => setEditingSupplier(null)} className="btn btn-sm btn-circle btn-ghost">✕</button>
                </div>
                
                <form onSubmit={handleUpdate} className="space-y-5">
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs font-bold text-gray-500 uppercase">Supplier Name</span>
                        </label>
                        <LimitedInput 
                            type="text" required 
                            maxLength={150}
                            showCounter={true}
                            className="input input-bordered w-full uppercase font-semibold text-lg py-6 focus:ring-2 focus:ring-primary/20" 
                            value={editName} onChange={e => setEditName(e.target.value)}
                        />
                    </div>
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs font-bold text-gray-500 uppercase">Contact Info</span>
                        </label>
                        <LimitedInput 
                            as="textarea"
                            maxLength={300}
                            showCounter={true}
                            className="textarea textarea-bordered w-full min-h-[100px] text-base focus:ring-2 focus:ring-primary/20" 
                            placeholder="Enter contact details..."
                            value={editContact} onChange={e => setEditContact(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-8">
                        <button type="button" onClick={() => setEditingSupplier(null)} className="btn btn-ghost sm:w-24">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSaving} className="btn btn-primary sm:w-40 shadow-lg">
                            {isSaving ? "Updating..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
      {/* CSV Import Modal */}
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
                <h3 className="font-bold text-lg text-gray-700 mb-4">Import Supplier CSV</h3>
                <p className="text-xs text-gray-500 mb-4">
                    CSV Format headers: <strong>INFO, SUPPLIER</strong><br/>
                    Supplier Name is the primary identifier. Matching names will update contact info if different.
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

      {/* Import Result Modal */}
      {importResult && (
        <div className="modal modal-open">
            <div className="modal-box max-w-lg text-center p-8 border border-slate-200 shadow-2xl">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${importResult.errors?.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {importResult.errors?.length > 0 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </div>
                <h3 className="font-bold text-xl text-slate-800">
                    {importResult.errors?.length > 0 ? "Import Completed with Notices" : "Import Successful"}
                </h3>
                <p className="text-sm text-slate-500 mb-6">Supplier list updated with CSV data.</p>
                
                <div className="grid grid-cols-3 gap-2 mb-6">
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

                {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mb-6 text-left bg-orange-50 border border-orange-100 rounded-lg p-3 max-h-60 overflow-y-auto">
                        <h4 className="text-xs font-bold text-orange-800 uppercase mb-2">
                            Notices & Skipped Rows ({importResult.errors.length}):
                        </h4>
                        <ul className="text-[11px] text-orange-700 space-y-1.5 list-disc pl-4 font-mono">
                            {importResult.errors.map((err, idx) => (
                                <li key={idx}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <button onClick={() => setImportResult(null)} className="btn btn-primary w-full shadow-lg">Close</button>
            </div>
        </div>
      )}
      <DeleteModal 
          isOpen={!!deletingSupplier}
          onClose={() => setDeletingSupplier(null)}
          onConfirm={confirmDelete}
          title="Delete Supplier"
          itemName={deletingSupplier?.name}
          itemIdentifier={deletingSupplier?.contact_info}
          isLoading={deleteLoading}
          warningText="This will not affect past transactions."
      />

      {toast && (
        <Toast 
          message={toast.message} 
          subMessage={toast.subMessage} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}