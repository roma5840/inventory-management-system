import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Navbar from "../components/Navbar";

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('suppliers').select('*').order('name');
    if (!error) setSuppliers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

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

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete supplier "${name}"? This will not affect past transactions.`)) return;
    try {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw error;
        setSuppliers(prev => prev.filter(s => s.id !== id));
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
                        placeholder="e.g. REX BOOKSTORE"
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
            <div className="overflow-x-auto">
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
                                        <button onClick={() => handleDelete(s.id, s.name)} className="btn btn-xs btn-ghost text-red-500">Delete</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>
    </div>
  );
}