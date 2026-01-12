import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";

export default function Dashboard({ products }) {
  const { userRole } = useAuth();
  const [filter, setFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter products
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase()) || 
    p.id.includes(filter)
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  const handleDelete = async (product) => {
    // Prevent deleting items with stock
    if (product.currentStock > 0) {
      alert(`ACTION DENIED:\nCannot delete "${product.name}" with existing stock (${product.currentStock}).\nPlease process a "PULL OUT" transaction first to zero out the inventory.`);
      return;
    }
    if(window.confirm(`Delete "${product.name}"?`)) {
      try {
        await deleteDoc(doc(db, "products", product.id));
      } catch (error) {
        console.error("Error deleting:", error);
        alert("Failed to delete. Check console.");
      }
    }
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-0">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="card-title text-xl">Current Inventory</h2>
          <input 
            type="text" 
            placeholder="Search name or ID..." 
            className="input input-bordered input-sm w-full max-w-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th>Barcode</th>
                <th>Product Name</th>
                <th className="text-right">Price</th>
                <th className="text-center">Stock</th>
                <th className="text-center">Status</th>
                {userRole === 'ADMIN' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    No products found.
                  </td>
                </tr>
              ) : (
                currentData.map((p) => (
                  <tr key={p.id} className="hover">
                    <td className="font-mono text-xs font-bold text-gray-500">{p.id}</td>
                    <td className="font-semibold text-gray-700">{p.name}</td>
                    <td className="text-right font-mono">${p.price}</td>
                    
                    <td className="text-center">
                      <span className={`font-bold ${p.currentStock <= p.minStockLevel ? 'text-red-600' : 'text-gray-700'}`}>
                        {p.currentStock}
                      </span>
                    </td>
                    
                    <td className="text-center">
                      {p.currentStock <= 0 ? (
                         <div className="badge badge-error text-white text-xs">OUT OF STOCK</div>
                      ) : p.currentStock <= p.minStockLevel ? (
                         <div className="badge badge-warning text-xs">LOW STOCK</div>
                      ) : (
                         <div className="badge badge-success text-white text-xs">OK</div>
                      )}
                    </td>

                    {userRole === 'ADMIN' && (
                      <td className="text-right">
                        <button 
                          onClick={() => handleDelete(p)}
                          className="btn btn-ghost btn-xs text-red-500"
                        >
                          Delete
                        </button>
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
           <span className="text-xs text-gray-500">
             Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredProducts.length)} of {filteredProducts.length} entries
           </span>
           <div className="join">
             <button 
               className="join-item btn btn-sm" 
               disabled={currentPage === 1}
               onClick={() => setCurrentPage(prev => prev - 1)}
             >
               «
             </button>
             <button className="join-item btn btn-sm pointer-events-none bg-white">
               Page {currentPage}
             </button>
             <button 
               className="join-item btn btn-sm" 
               disabled={currentPage === totalPages || totalPages === 0}
               onClick={() => setCurrentPage(prev => prev + 1)}
             >
               »
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}