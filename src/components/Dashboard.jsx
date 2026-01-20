import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Dashboard({ lastUpdated }) {
  const { userRole } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); // Instant UI input
  const [debouncedTerm, setDebouncedTerm] = useState(""); // Delayed query value
  
  // Pagination State
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageStack, setPageStack] = useState([]); 
  const [lastVisible, setLastVisible] = useState(null);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", minStockLevel: "" });
  const [updateLoading, setUpdateLoading] = useState(false);

  // Handle Debounce (Only for typing)
  // This updates 'debouncedTerm' 250ms after user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle Fetching (Immediate response to Page or Debounced Term)
  // runs instantly when page changes, or after the 250ms search delay.
  useEffect(() => {
    setLoading(true);
    
    const fetchInventory = async () => {
        let query = supabase
            .from('products')
            .select('*, currentStock:current_stock, minStockLevel:min_stock_level', { count: 'exact' });

        if (debouncedTerm.trim()) {
            query = query.or(`name.ilike.%${debouncedTerm}%,id.ilike.%${debouncedTerm}%`);
        } else {
            query = query.order('name', { ascending: true });
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        
        const { data, count, error } = await query.range(from, to);

        if (error) console.error(error);
        else setProducts(data || []);
        
        setLoading(false);
    };

    fetchInventory();
    
    // Realtime Subscription
    const channel = supabase.channel('table-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
            fetchInventory();
        })
        .subscribe();

    return () => supabase.removeChannel(channel);

  }, [debouncedTerm, currentPage, lastUpdated]);

  const handleNext = () => {
    if (!lastVisible) return;
    setPageStack(prev => [...prev, lastVisible]);
    setCurrentPage(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentPage === 1) return;
    setPageStack(prev => prev.slice(0, -1));
    setCurrentPage(prev => prev - 1);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value); // Updates Input immediately
    // Reset pagination immediately so UI doesn't look weird
    setCurrentPage(1);
    setPageStack([]);
    setLastVisible(null);
  }

  const openEditModal = (product) => {
    setEditingProduct(product);
    setEditForm({
        name: product.name,
        price: product.price,
        minStockLevel: product.minStockLevel,
        location: product.location || ""
    });
  };


  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);

    const newPrice = Number(editForm.price);
    const newMinLevel = Number(editForm.minStockLevel);

    if (!editForm.name.trim()) {
        alert("Error: Product Name is required.");
        setUpdateLoading(false); return;
    }
    if (newPrice < 0) {
        alert("Error: Price cannot be negative.");
        setUpdateLoading(false); return;
    }
    if (newMinLevel < 0) {
        alert("Error: Min Stock Level cannot be negative.");
        setUpdateLoading(false); return;
    }

    try {
        const newKeywords = editForm.name.toLowerCase().split(/\s+/).filter(w => w.length > 0);

        const { error } = await supabase
            .from('products')
            .update({
                name: editForm.name,
                price: newPrice,
                min_stock_level: newMinLevel,
                location: editForm.location,
                search_keywords: newKeywords,
                last_updated: new Date()
            })
            .eq('id', editingProduct.id);

        if (error) throw error;
        
        setEditingProduct(null);
        alert("Product Details Updated Successfully.");
    } catch (err) {
        console.error(err);
        alert("Update failed: " + err.message);
    } finally {
        setUpdateLoading(false);
    }
  };

  const handleDelete = async (product) => {
    // Audit Check: Prevent deleting items that still have stock
    if (product.currentStock > 0) return alert("Error: Stock must be 0 to delete item.");
    
    if(window.confirm(`Are you sure you want to delete "${product.name}" permanently?`)) {
        try {
            const { error } = await supabase.from('products').delete().eq('id', product.id);
            if (error) throw error;
            // The realtime listener in useEffect will automatically remove it from the UI
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete item.");
        }
    }
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-0">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="card-title text-xl">Current Inventory</h2>
          <div className="flex gap-2 items-center">
             <input 
              type="text" 
              placeholder="Search keyword..." 
              className="input input-bordered input-sm w-full max-w-xs"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto h-96">
          <table className="table w-full table-pin-rows">
            <thead className="bg-gray-100 text-gray-600 z-10">
              <tr>
                <th>Barcode</th>
                <th>Product Name</th>
                <th>Location</th>
                <th className="text-right">Price</th>
                <th className="text-center">Stock</th>
                <th className="text-center">Status</th>
                {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && <th></th>}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && !loading ? (
                <tr><td colSpan="7" className="text-center py-8 text-gray-400">No products found.</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover group border-b border-gray-100">
                    <td className="font-mono text-xs font-bold text-gray-500">{p.id}</td>
                    <td className="font-semibold text-gray-700">{p.name}</td>
                    <td className="text-xs text-gray-500">{p.location || "-"}</td>
                    <td className="text-right font-mono">₱{p.price.toLocaleString()}</td>
                    <td className="text-center">
                      <span className={`font-bold ${p.currentStock <= p.minStockLevel ? 'text-red-600' : 'text-gray-700'}`}>
                        {p.currentStock}
                      </span>
                    </td>
                    <td className="text-center">
                      {p.currentStock <= 0 ? <div className="badge badge-error text-white text-xs font-bold">OUT</div> : 
                       p.currentStock <= p.minStockLevel ? <div className="badge badge-warning text-xs font-bold">LOW</div> : 
                       <div className="badge badge-success text-white text-xs font-bold">OK</div>}
                    </td>
                    
                    {/* ACTION BUTTONS */}
                    {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                      <td className="text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => openEditModal(p)} 
                                className="btn btn-square btn-xs btn-ghost text-blue-600 hover:bg-blue-50 tooltip tooltip-left"
                                data-tip="Edit Details"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                            </button>
                            <button 
                                onClick={() => handleDelete(p)} 
                                className="btn btn-square btn-xs btn-ghost text-red-500 hover:bg-red-50 tooltip tooltip-left"
                                data-tip="Delete Item"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
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
        <div className="p-4 border-t flex justify-between items-center bg-gray-50 rounded-b-xl">
           <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
             Page {currentPage}
           </span>
           <div className="flex gap-2">
             <button 
               className="btn btn-sm btn-outline bg-white hover:bg-gray-100" 
               onClick={handlePrev} 
               disabled={currentPage === 1 || loading}
             >
               « Previous
             </button>
             <button 
               className="btn btn-sm btn-outline bg-white hover:bg-gray-100" 
               onClick={handleNext} 
               disabled={products.length < ITEMS_PER_PAGE || loading}
             >
               Next »
             </button>
           </div>
        </div>
        {/* EDIT MODAL (Pop-up) */}
      {editingProduct && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-gray-700 mb-4">
                Update Item Details
            </h3>
            
            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
                
                {/* READ ONLY FIELDS (For Audit Safety) */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-400">Barcode / ISBN</label>
                        <input type="text" value={editingProduct.id} disabled className="input input-bordered input-sm bg-gray-100" />
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
                    <input 
                        type="text" 
                        className="input input-bordered w-full" 
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        required
                    />
                </div>

                <div className="form-control">
                    <label className="label text-xs uppercase font-bold text-gray-500">Location / Rack</label>
                    <input 
                        type="text" 
                        className="input input-bordered w-full" 
                        value={editForm.location}
                        onChange={e => setEditForm({...editForm, location: e.target.value})}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Price (₱) *</label>
                        <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            className="input input-bordered w-full" 
                            value={editForm.price}
                            onChange={e => setEditForm({...editForm, price: e.target.value})}
                            required
                        />
                    </div>
                    <div className="form-control">
                        <label className="label text-xs uppercase font-bold text-gray-500">Min. Alert Level *</label>
                        <input 
                            type="number" 
                            min="0"
                            className="input input-bordered w-full" 
                            value={editForm.minStockLevel}
                            onChange={e => setEditForm({...editForm, minStockLevel: e.target.value})}
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
      </div>
    </div>
  );
}