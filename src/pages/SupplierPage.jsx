import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Navbar from "../components/Navbar";

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
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [jumpPage, setJumpPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const fetchSuppliers = async () => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
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
  }, [page]);

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
            setSuppliers(prev => prev.map(s => 
                s.id === editingSupplier.id 
                ? { ...s, name: editName.trim().toUpperCase(), contact_info: editContact.trim() } 
                : s
            ));
            setEditingSupplier(null);
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
        // Refetch to maintain correct pagination count and fill the list
        fetchSuppliers();
    } catch (err) {
        alert("Error deleting supplier: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      <main className="container mx-auto px-4 max-w-4xl">
        <div className="card bg-base-100 shadow-xl">
            <div className="p-4 border-b bg-gray-50 rounded-t-xl">
                <h2 className="card-title text-xl text-gray-700">Manage Suppliers</h2>
                <p className="text-xs text-gray-500">Add suppliers here to see them in the autocomplete list during Receiving/Pull-out.</p>
            </div>

            {/* Add Form */}
            <form onSubmit={handleAdd} className="p-4 bg-white border-b flex flex-col md:flex-row gap-4 items-end">
                <div className="form-control flex-1 w-full">
                    <label className="label"><span className="label-text text-xs font-bold uppercase">Supplier Name</span></label>
                    <input 
                        type="text" required 
                        className="input input-bordered uppercase" 
                        placeholder="Type Supplier..."
                        value={newName} onChange={e => setNewName(e.target.value)}
                    />
                </div>
                <div className="form-control flex-1 w-full">
                    <label className="label"><span className="label-text text-xs font-bold uppercase">Contact Info (Optional)</span></label>
                    <input 
                        type="text" 
                        className="input input-bordered" 
                        placeholder="Phone / Address"
                        value={newContact} onChange={e => setNewContact(e.target.value)}
                    />
                </div>
                <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                    {isSubmitting ? "Saving..." : "Add Supplier"}
                </button>
            </form>

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
                             <tr><td colSpan="3" className="text-center py-4">Loading...</td></tr>
                        ) : suppliers.length === 0 ? (
                             <tr><td colSpan="3" className="text-center py-4 text-gray-400">No suppliers found.</td></tr>
                        ) : (
                            suppliers.map(s => (
                                <tr key={s.id} className="hover">
                                    <td className="font-bold text-gray-700">{s.name}</td>
                                    <td className="text-gray-500 text-sm">{s.contact_info || "-"}</td>
                                    <td className="text-right">
                                        <button onClick={() => handleEditClick(s)} className="btn btn-xs btn-ghost text-blue-500 mr-2">Edit</button>
                                        <button onClick={() => handleDelete(s.id, s.name)} className="btn btn-xs btn-ghost text-red-500">Delete</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t bg-gray-50 rounded-b-xl gap-4">
                <div className="text-xs text-gray-500">
                    {totalCount > 0 
                    ? `Showing ${(page - 1) * ITEMS_PER_PAGE + 1} - ${Math.min(page * ITEMS_PER_PAGE, totalCount)} of ${totalCount} records`
                    : "No records found"}
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        className="btn btn-sm btn-outline bg-white"
                        disabled={page === 1 || loading}
                        onClick={() => {
                            const newPage = page - 1;
                            setPage(newPage);
                            setJumpPage(newPage);
                        }}
                    >
                        « Prev
                    </button>
                    
                    <div className="flex items-center gap-1">
                        <input 
                            type="number" 
                            min="1" 
                            max={Math.ceil(totalCount / ITEMS_PER_PAGE) || 1}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    let p = parseInt(jumpPage);
                                    const max = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;
                                    if (p > 0 && p <= max) {
                                        setPage(p);
                                    }
                                }
                            }}
                            className="input input-sm input-bordered w-16 text-center"
                        />
                        <span className="text-xs text-gray-500">of {Math.ceil(totalCount / ITEMS_PER_PAGE) || 1}</span>
                    </div>

                    <button 
                        className="btn btn-sm btn-outline bg-white"
                        disabled={page >= Math.ceil(totalCount / ITEMS_PER_PAGE) || loading}
                        onClick={() => {
                            const newPage = page + 1;
                            setPage(newPage);
                            setJumpPage(newPage);
                        }}
                    >
                        Next »
                    </button>
                </div>
            </div>
        </div>
      </main>
      {/* Edit Modal */}
      {editingSupplier && (
        <div className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg text-gray-700 border-b pb-2 mb-4">Edit Supplier</h3>
                
                <form onSubmit={handleUpdate} className="flex flex-col gap-4">
                    <div className="form-control w-full">
                        <label className="label"><span className="label-text text-xs font-bold uppercase">Supplier Name</span></label>
                        <input 
                            type="text" required 
                            className="input input-bordered uppercase" 
                            value={editName} onChange={e => setEditName(e.target.value)}
                        />
                    </div>
                    <div className="form-control w-full">
                        <label className="label"><span className="label-text text-xs font-bold uppercase">Contact Info</span></label>
                        <input 
                            type="text" 
                            className="input input-bordered" 
                            value={editContact} onChange={e => setEditContact(e.target.value)}
                        />
                    </div>
                    <div className="modal-action mt-6">
                        <button type="button" onClick={() => setEditingSupplier(null)} className="btn btn-ghost">Cancel</button>
                        <button type="submit" disabled={isSaving} className="btn btn-primary">
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}