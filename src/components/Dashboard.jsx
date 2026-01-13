import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import { doc, deleteDoc, collection, query, orderBy, limit, onSnapshot, where, startAfter } from "firebase/firestore";

export default function Dashboard() {
  const { userRole } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Pagination State
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageStack, setPageStack] = useState([]); // Stores the lastDoc of every previous page
  const [lastVisible, setLastVisible] = useState(null); // The last doc of the CURRENT page

  // Real-time Listener
  useEffect(() => {
    setLoading(true);
    const collectionRef = collection(db, "products");
    let q;

    // Determine Base Query (Search vs Normal)
    let baseConstraints = [];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      baseConstraints = [where("searchKeywords", "array-contains", term)];
    } else {
      baseConstraints = [orderBy("name")];
    }

    // Add Pagination Cursor
    if (currentPage > 1 && pageStack[currentPage - 2]) {
      // If we are on Page 2, we start after the last doc of Page 1 (index 0)
      baseConstraints.push(startAfter(pageStack[currentPage - 2]));
    }

    // Apply Limit
    q = query(collectionRef, ...baseConstraints, limit(ITEMS_PER_PAGE));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      setProducts(items);
      
      // Store the last visible doc of THIS page to enable the "Next" button
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      } else {
        setLastVisible(null);
      }
      
      setLoading(false);
    }, (error) => {
      console.error("Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [searchTerm, currentPage]); // Only re-run if Page # or Search changes

  const handleNext = () => {
    if (!lastVisible) return;
    setPageStack(prev => [...prev, lastVisible]); // Save current cursor
    setCurrentPage(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentPage === 1) return;
    setPageStack(prev => prev.slice(0, -1)); // Pop the last cursor
    setCurrentPage(prev => prev - 1);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
    setPageStack([]);
    setLastVisible(null);
  }

  const handleDelete = async (product) => {
    if (product.currentStock > 0) return alert("Error: Stock must be 0 to delete.");
    if(window.confirm(`Delete "${product.name}"?`)) {
        await deleteDoc(doc(db, "products", product.id));
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
              {products.length === 0 && !loading ? (
                <tr><td colSpan="6" className="text-center py-8 text-gray-400">No products found.</td></tr>
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
                      {p.currentStock <= 0 ? <div className="badge badge-error text-white text-xs">OUT</div> : 
                       p.currentStock <= p.minStockLevel ? <div className="badge badge-warning text-xs">LOW</div> : 
                       <div className="badge badge-success text-white text-xs">OK</div>}
                    </td>
                    {userRole === 'ADMIN' && (
                      <td className="text-right">
                        <button onClick={() => handleDelete(p)} className="btn btn-ghost btn-xs text-red-500">Del</button>
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
      </div>
    </div>
  );
}