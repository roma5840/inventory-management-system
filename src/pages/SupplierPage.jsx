import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";

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
        if (error.code === '23505') alert("Supplier already exists.");
        else throw error;
      } else {
        setNewName("");
        setNewContact("");
        
        // Broadcast update to other users
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });

        fetchSuppliers();
      }
    } catch (err) {
      alert("Error adding supplier: " + err.message);
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
            if (error.code === '23505') alert("Supplier name already exists.");
            else throw error;
        } else {
            // Broadcast update to other users
            await supabase.channel('app_updates').send({
                type: 'broadcast', event: 'inventory_update', payload: {} 
            });

            setEditingSupplier(null);
            fetchSuppliers();
        }
    } catch (err) {
        alert("Error updating supplier: " + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete supplier "${name}"? This will not affect past transactions.`)) return;
    try {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw error;
        
        // Broadcast update to other users
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'inventory_update', payload: {} 
        });
        
        fetchSuppliers();
    } catch (err) {
        alert("Error deleting supplier: " + err.message);
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
                        <input 
                            type="text" required 
                            className="input input-bordered w-full uppercase focus:ring-2 focus:ring-primary/20" 
                            placeholder="SUPPLIER NAME"
                            value={newName} onChange={e => setNewName(e.target.value)}
                        />
                    </div>
                    <div className="form-control md:col-span-5 w-full">
                        <label className="label">
                            <span className="label-text text-xs font-bold text-gray-500 uppercase">Contact Info (Optional)</span>
                        </label>
                        <input 
                            type="text" 
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
                             <tr><td colSpan="3" className="text-center py-10"><span className="loading loading-spinner loading-md text-primary"></span></td></tr>
                        ) : suppliers.length === 0 ? (
                             <tr><td colSpan="3" className="text-center py-10 text-gray-400 italic">No suppliers found in the database.</td></tr>
                        ) : (
                            suppliers.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="font-bold text-gray-800 py-4 max-w-[200px]">
                                        <div className="break-all whitespace-normal leading-tight">
                                            {s.name}
                                        </div>
                                    </td>
                                    <td className="text-gray-500 text-sm max-w-[250px]">
                                        <div className="break-all whitespace-normal">
                                            {s.contact_info || <span className="text-gray-300 italic">No info</span>}
                                        </div>
                                    </td>
                                    <td className="text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => handleEditClick(s)} 
                                                className="btn btn-sm btn-outline btn-info px-4"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(s.id, s.name)} 
                                                className="btn btn-sm btn-outline btn-error px-4"
                                            >
                                                Delete
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
                        <input 
                            type="text" required 
                            className="input input-bordered w-full uppercase font-semibold text-lg py-6 focus:ring-2 focus:ring-primary/20" 
                            value={editName} onChange={e => setEditName(e.target.value)}
                        />
                    </div>
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text text-xs font-bold text-gray-500 uppercase">Contact Info</span>
                        </label>
                        <textarea 
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
    </div>
  );
}