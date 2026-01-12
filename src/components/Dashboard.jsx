import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";

export default function Dashboard({ products }) {
  const { userRole } = useAuth();
  const [filter, setFilter] = useState("");

  // Simple client-side search
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase()) || 
    p.id.includes(filter)
  );

  const handleDelete = async (id) => {
    if(window.confirm("Are you sure you want to delete this product?")) {
      await deleteDoc(doc(db, "products", id));
    }
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-0">
        {/* Table Header with Search */}
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

        {/* The Table */}
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
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    No products found matching "{filter}"
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover">
                    <td className="font-mono text-xs font-bold text-gray-500">{p.id}</td>
                    <td className="font-semibold text-gray-700">{p.name}</td>
                    <td className="text-right font-mono">${p.price}</td>
                    
                    <td className="text-center">
                      <span className={`font-bold text-lg ${p.currentStock <= p.minStockLevel ? 'text-red-600' : 'text-gray-700'}`}>
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
                          onClick={() => handleDelete(p.id)}
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
      </div>
    </div>
  );
}