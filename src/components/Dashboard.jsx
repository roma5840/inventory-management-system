import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import { doc, deleteDoc, collection, query, orderBy, limit, startAfter, getDocs, where } from "firebase/firestore";

export default function Dashboard() {
  const { userRole } = useAuth();
  const [products, setProducts] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Initial Fetch & Search Handler
  const fetchProducts = async (isNextPage = false) => {
    setLoading(true);
    try {
      const collectionRef = collection(db, "products");
      let q;

      if (searchTerm.trim()) {
        // SEARCH MODE: exact word match in array
        const term = searchTerm.toLowerCase().trim();
        q = query(collectionRef, where("searchKeywords", "array-contains", term), limit(20));
        if (isNextPage && lastDoc) {
             q = query(collectionRef, where("searchKeywords", "array-contains", term), startAfter(lastDoc), limit(20));
        }
      } else {
        // DEFAULT MODE: recent items
        q = query(collectionRef, orderBy("name"), limit(20));
        if (isNextPage && lastDoc) {
             q = query(collectionRef, orderBy("name"), startAfter(lastDoc), limit(20));
        }
      }

      const snapshot = await getDocs(q);
      const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      if (isNextPage) {
        setProducts(prev => [...prev, ...newItems]);
      } else {
        setProducts(newItems);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search or trigger on Enter
  useEffect(() => {
    const timer = setTimeout(() => {
        setLastDoc(null); // Reset pagination on new search
        fetchProducts(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleDelete = async (product) => {
    if (product.currentStock > 0) {
      alert(`ACTION DENIED: Stock exists.`);
      return;
    }
    if(window.confirm(`Delete "${product.name}"?`)) {
      await deleteDoc(doc(db, "products", product.id));
      fetchProducts(false); // Refresh
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
            placeholder="Search keyword (e.g. 'Math')" 
            className="input input-bordered input-sm w-full max-w-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-96">
          <table className="table w-full">
            <thead className="bg-gray-100 text-gray-600 sticky top-0 z-10">
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
              {products.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    {loading ? "Loading..." : "No products found."}
                  </td>
                </tr>
              ) : (
                products.map((p) => (
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
                        <button onClick={() => handleDelete(p)} className="btn btn-ghost btn-xs text-red-500">Delete</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        <div className="p-2 border-t text-center">
             <button 
               className="btn btn-sm btn-ghost text-primary"
               onClick={() => fetchProducts(true)}
               disabled={loading}
             >
               {loading ? "Loading..." : "Load More"}
             </button>
        </div>
      </div>
    </div>
  );
}