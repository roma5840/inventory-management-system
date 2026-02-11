import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";
import LimitedInput from "../components/LimitedInput";
import Toast from "../components/Toast";
import DeleteModal from "../components/DeleteModal";

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const fetchSuppliers = async () => {
    setLoading(true);
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, count, error } = await supabase
        .from('suppliers')
        .select('*', { count: 'exact' })
        .order('name')
        .range(from, to);

    if (!error) {
        setSuppliers(data || []);
        setTotalCount(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();

    const dbChannel = supabase.channel('supplier-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, fetchSuppliers)
        .subscribe();

    return () => {
        supabase.removeChannel(dbChannel);
    };
  }, [currentPage]); // Dependency updated

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


            {/* Add Form */}
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

            {/* List */}
            <div className="overflow-x-auto min-h-[400px]">
                <table className="table w-full">
                    <thead className="bg-gray-100">
                        <tr>
                            <th>Name</th>
                            <th>Contact Info</th>
                            <th className="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                             <tr><td colSpan="3" className="text-center py-12 text-slate-400 font-medium"><span className="loading loading-spinner loading-md text-primary"></span></td></tr>
                        ) : suppliers.length === 0 ? (
                             <tr><td colSpan="3" className="text-center py-12 text-slate-400 font-medium italic">No suppliers found in the database.</td></tr>
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
      <DeleteModal 
          isOpen={!!deletingSupplier}
          onClose={() => setDeletingSupplier(null)}
          onConfirm={confirmDelete}
          title="Delete Supplier"
          itemName={deletingSupplier?.name}
          itemIdentifier={deletingSupplier?.contact_info}
          isLoading={deleteLoading}
          warningText="This action cannot be undone. Ensure this supplier has no critical pending records."
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