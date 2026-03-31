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
  const [importProgress, setImportProgress] = useState("");
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

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Debounce Search Term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchSuppliers = async (options = { ignore: false }) => {
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

    if (options.ignore) return; // Prevent race conditions

    if (!error) {
        setSuppliers(data || []);
        setTotalCount(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    const fetchOptions = { ignore: false };
    fetchSuppliers(fetchOptions);

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
        fetchOptions.ignore = true; // Discard stale results
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
    setImportProgress("Analyzing CSV file...");

    const REQUIRED_HEADERS = ["INFO", "SUPPLIER"];

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: (chunk) => {
        const lines = chunk.split('\n');
        const headerIndex = lines.findIndex(line => 
            line.toUpperCase().includes('SUPPLIER') && 
            line.toUpperCase().includes('INFO')
        );
        return headerIndex > -1 ? lines.slice(headerIndex).join('\n') : chunk;
      },
      complete: async (results) => {
        try {
            const headers = results.meta.fields || [];

            const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
            const extraHeaders = headers.filter(h => !REQUIRED_HEADERS.includes(h));

            if (missingHeaders.length > 0 || extraHeaders.length > 0) {
                let errorMsg = "CSV Format Error. ";
                if (missingHeaders.length > 0) errorMsg += `Missing/Invalid: [${missingHeaders.join(', ')}]. `;
                if (extraHeaders.length > 0) errorMsg += `Unknown headers: [${extraHeaders.join(', ')}]. `;
                throw new Error(errorMsg + "Please ensure exact match with the template (case-sensitive, exact spaces).");
            }

            const rows = results.data;
            if (rows.length === 0) throw new Error("No data found in the CSV.");

            const validationErrors = [];

            const sanitize = (str) => {
                if (typeof str !== 'string') return str !== undefined && str !== null ? String(str).trim() : null;
                const clean = str.trim();
                return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
            };

            setImportProgress("Validating and cleaning rows...");

            const rawRows = rows.map((r, index) => {
                let rawName = sanitize(r['SUPPLIER']);
                const name = (!rawName || rawName.toUpperCase() === '#N/A' || rawName.toUpperCase() === 'N/A') ? null : rawName.toUpperCase();
                
                let rawInfo = sanitize(r['INFO']);
                const contact_info = (!rawInfo || rawInfo.toUpperCase() === '#N/A' || rawInfo.toUpperCase() === 'N/A') ? null : rawInfo;

                const rowId = name || `Row ${index + 2}`;
                let rowValid = true;

                if (!name) { validationErrors.push(`[${rowId}] Missing Supplier Name. Row Skipped.`); rowValid = false; }
                else if (name.length > 150) { validationErrors.push(`[${rowId}] Name exceeds 150 characters.`); rowValid = false; }
                if (contact_info && contact_info.length > 300) { validationErrors.push(`[${rowId}] Info/Contact exceeds 300 characters.`); rowValid = false; }

                if (!rowValid) return null;
                return { name, contact_info };
            }).filter(Boolean);

            if (rawRows.length === 0 && validationErrors.length === 0) throw new Error("Could not parse rows.");

            const uniqueMap = new Map();
            rawRows.forEach((r) => {
                if (uniqueMap.has(r.name)) {
                    const existing = uniqueMap.get(r.name);
                    if (r.contact_info) {
                        if (!existing.contact_info) {
                            existing.contact_info = r.contact_info;
                            validationErrors.push(`[${r.name}] CSV Duplicate Merged: Added contact info.`);
                        } else if (!existing.contact_info.includes(r.contact_info)) {
                            // Intelligent merging: Append new distinct contact info
                            existing.contact_info = `${existing.contact_info} // ${r.contact_info}`;
                            validationErrors.push(`[${r.name}] CSV Duplicate Merged: Appended new contact info.`);
                        } else {
                            validationErrors.push(`[${r.name}] CSV Duplicate Skipped: Identical row.`);
                        }
                    } else {
                        validationErrors.push(`[${r.name}] CSV Duplicate Skipped: No new info.`);
                    }
                    uniqueMap.set(r.name, existing);
                } else {
                    uniqueMap.set(r.name, r);
                }
            });

            const cleanRows = Array.from(uniqueMap.values());
            const { data: { session } } = await supabase.auth.getSession();
            
            const CHUNK_SIZE = 500;
            let totalInserted = 0, totalUpdated = 0, totalUnchanged = 0;
            const allErrors = [...validationErrors];
            const batchId = crypto.randomUUID();
            const totalChunks = Math.ceil(cleanRows.length / CHUNK_SIZE);

            for (let i = 0; i < cleanRows.length; i += CHUNK_SIZE) {
                const currentChunkNum = Math.floor(i / CHUNK_SIZE) + 1;
                const itemsProcessed = Math.min(i + CHUNK_SIZE, cleanRows.length);
                setImportProgress(`Saving batch ${currentChunkNum} of ${totalChunks}... (${itemsProcessed} / ${cleanRows.length} items)`);

                const chunk = cleanRows.slice(i, i + CHUNK_SIZE);
                
                const res = await fetch('/api/manage-supplier', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ action: 'IMPORT', rows: chunk, batch_id: batchId })
                });
                
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || `Failed processing batch ${currentChunkNum}`);

                totalInserted += result.importResult.inserted;
                totalUpdated += result.importResult.updated;
                totalUnchanged += result.importResult.unchanged;
                if (result.importResult.errors) allErrors.push(...result.importResult.errors);
            }

            setImportProgress("Finalizing import...");
            setImportResult({ inserted: totalInserted, updated: totalUpdated, unchanged: totalUnchanged, errors: allErrors });
            setIsImportModalOpen(false);
            fetchSuppliers();

        } catch (err) {
            showToast("Import Failed", err.message, "error");
        } finally {
            setImportLoading(false);
            setImportProgress("");
            e.target.value = null;
        }
      },
      error: (error) => {
        showToast("Parsing Error", error.message, "error");
        setImportLoading(false);
        setImportProgress("");
        e.target.value = null;
      }
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const payloadToSubmit = {
        name: newName.trim().toUpperCase(),
        contact_info: newContact.trim()
      };

      const res = await fetch('/api/manage-supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'CREATE', payload: payloadToSubmit })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to register supplier");

      setNewName("");
      setNewContact("");
      setIsAddModalOpen(false);
      showToast("Supplier Registered", "New vendor added to the system.");
      
      await supabase.channel('app_updates').send({
          type: 'broadcast', event: 'inventory_update', payload: {} 
      });

      fetchSuppliers();
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
        const { data: { session } } = await supabase.auth.getSession();
        
        const payloadToSubmit = {
            name: editName.trim().toUpperCase(),
            contact_info: editContact.trim()
        };

        const res = await fetch('/api/manage-supplier', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ action: 'UPDATE', id: editingSupplier.id, payload: payloadToSubmit })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to update supplier");

        showToast("Update Successful", "Supplier details updated.");
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });

        setEditingSupplier(null);
        fetchSuppliers();
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
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/manage-supplier', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ action: 'DELETE', id: deletingSupplier.id })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to delete supplier");
        
        showToast("Supplier Removed", `${deletingSupplier.name} deleted successfully.`, "delete");
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });
        
        setDeletingSupplier(null);
        fetchSuppliers();
    } catch (err) {
        showToast("Delete Failed", err.message, "error");
    } finally {
        setDeleteLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">SUPPLIERS</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Manage vendor profiles for inventory receiving and procurement.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">    

            {/* Action Bar (Search & Import) */}
            <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row justify-between items-center bg-white rounded-t-xl gap-4">
                <div className="flex flex-col lg:flex-row items-center gap-6 w-full xl:w-auto">
                    <div className="text-center lg:text-left">
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase">Supplier Directory</h2>
                    </div>

                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                            <button 
                                onClick={handleDownloadTemplate}
                                className="btn btn-sm bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-lg px-4 gap-2 h-8 normal-case"
                                title="Download CSV Template"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                <span className="text-[11px] font-bold uppercase tracking-widest">Template</span>
                            </button>
                            
                            <button 
                                onClick={() => setIsAddModalOpen(true)}
                                className="btn btn-sm btn-primary rounded-lg px-4 gap-2 h-8 normal-case"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                </svg>
                                <span className="text-[11px] font-bold uppercase tracking-widest">New Supplier</span>
                            </button>

                            <button 
                                onClick={() => setIsImportModalOpen(true)}
                                className="btn btn-sm bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-lg px-4 gap-2 h-8 normal-case"
                            >
                                <span className="text-[11px] font-bold uppercase tracking-widest">Import CSV</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="relative w-full xl:w-72">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search suppliers..." 
                        className="input input-sm w-full pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all text-xs rounded-lg h-8"
                        value={searchTerm}
                        onChange={handleSearch}
                    />
                </div>
            </div>

            {/* List */}
            <div className="overflow-x-auto min-h-[400px]">
                <table className="table w-full">
                    <thead>
                        <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                            <th className="bg-slate-50/80">Name</th>
                            <th className="bg-slate-50/80">Contact Info</th>
                            {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th className="text-right bg-slate-50/80">Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                                <tr><td colSpan={['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? "3" : "2"} className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
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


      {/* === REGISTER NEW SUPPLIER MODAL === */}
      {isAddModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl border border-slate-200 shadow-2xl p-0 overflow-hidden">
            <div className="p-6 border-b bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800">Register New Supplier</h3>
                <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">Add a new vendor to the directory.</p>
            </div>
            
            <form onSubmit={handleAdd} className="p-6 flex flex-col gap-4">
                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Supplier Name *</label>
                    <LimitedInput 
                        type="text" 
                        maxLength={150}
                        showCounter={true}
                        className="input input-bordered w-full uppercase bg-slate-50 focus:bg-white" 
                        placeholder="FULL COMPANY NAME"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        required
                        disabled={isSubmitting}
                    />
                </div>

                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Contact Info / Address</label>
                    <LimitedInput 
                        as="textarea"
                        maxLength={300}
                        showCounter={true}
                        className="textarea textarea-bordered w-full min-h-[100px] bg-slate-50 focus:bg-white" 
                        placeholder="Phone, Email, or Physical Address"
                        value={newContact}
                        onChange={e => setNewContact(e.target.value)}
                        disabled={isSubmitting}
                    />
                </div>

                <div className="modal-action mt-2 pt-4 border-t border-slate-100">
                    <button 
                        type="button" 
                        className="btn btn-ghost text-slate-500 normal-case" 
                        onClick={() => {
                            setIsAddModalOpen(false);
                            setNewName("");
                            setNewContact("");
                        }}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting} 
                        className="btn btn-primary px-8 normal-case min-w-[140px]"
                    >
                        {isSubmitting ? (
                            <span className="loading loading-spinner loading-sm"></span>
                        ) : (
                            "Add Supplier"
                        )}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal (Matches Register Modal UI/UX) */}
    {editingSupplier && (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl border border-slate-200 shadow-2xl p-0 overflow-hidden">
            <div className="p-6 border-b bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800">Update Supplier Details</h3>
                <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">Modify existing vendor information.</p>
            </div>
            
            <form onSubmit={handleUpdate} className="p-6 flex flex-col gap-4">
                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Supplier Name *</label>
                    <LimitedInput 
                        type="text" 
                        maxLength={150}
                        showCounter={true}
                        className="input input-bordered w-full uppercase font-medium bg-slate-50 focus:bg-white" 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        required
                        disabled={isSaving}
                    />
                </div>

                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Contact Info / Address</label>
                    <LimitedInput 
                        as="textarea"
                        maxLength={300}
                        showCounter={true}
                        className="textarea textarea-bordered w-full min-h-[100px] bg-slate-50 focus:bg-white" 
                        placeholder="Phone, Email, or Physical Address"
                        value={editContact}
                        onChange={e => setEditContact(e.target.value)}
                        disabled={isSaving}
                    />
                </div>

                <div className="modal-action mt-2 pt-4 border-t border-slate-100">
                    <button 
                        type="button" 
                        className="btn btn-ghost text-slate-500 normal-case" 
                        onClick={() => setEditingSupplier(null)}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSaving} 
                        className="btn btn-primary px-8 normal-case min-w-[140px]"
                    >
                        {isSaving ? (
                            <span className="loading loading-spinner loading-sm"></span>
                        ) : (
                            "Save Changes"
                        )}
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
                    <p className="text-sm text-gray-500 mt-1 font-medium">{importProgress}</p>
                    <p className="text-xs text-gray-400 mt-2">Please do not close or refresh this window.</p>
                  </div>
               </div>
            ) : (
               <>
                <h3 className="font-bold text-lg text-gray-700 mb-4">Import Supplier CSV</h3>
                <p className="text-xs text-gray-500 mb-4">
                    CSV Format headers: <strong>INFO, SUPPLIER</strong><br/>
                    Supplier Name is the primary identifier. Matching names will update contact info if different. Large files may take up to a minute to process.
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