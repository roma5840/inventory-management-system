import { useState } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function ProductManager() {
  const [formData, setFormData] = useState({
    id: "", // Barcode
    name: "",
    price: "",
    minStockLevel: 10,
    currentStock: 0,
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const price = Number(formData.price);
    const stock = Number(formData.currentStock);
    const minStock = Number(formData.minStockLevel);

    if (!formData.id.trim()) {
        setMsg("Error: Barcode/ISBN is required.");
        setLoading(false); return;
    }
    if (!formData.name.trim()) {
        setMsg("Error: Book Title is required.");
        setLoading(false); return;
    }
    if (price < 0) {
        setMsg("Error: Price cannot be negative.");
        setLoading(false); return;
    }
    if (stock < 0) {
        setMsg("Error: Stock cannot be negative.");
        setLoading(false); return;
    }
    if (minStock < 0) {
        setMsg("Error: Min Alert cannot be negative.");
        setLoading(false); return;
    }

    try {
      await import("firebase/firestore").then(async ({ runTransaction }) => {
        await runTransaction(db, async (transaction) => {
          const productRef = doc(db, "products", formData.id);
          const statsRef = doc(db, "stats", "summary");
          
          // This is the ONLY time we read the document now
          const productDoc = await transaction.get(productRef);
          const statsDoc = await transaction.get(statsRef);

          // Strict check: Block save if ID exists
          if (productDoc.exists()) {
            throw "Product ID already exists. Please use the Inventory List to edit this item.";
          }

          // Prepare Keyword Array for Search
          const searchKeywords = formData.name.toLowerCase().split(/\s+/).filter(w => w.length > 0);

          // Create Product
          transaction.set(productRef, {
            id: formData.id,
            name: formData.name,
            price: price,
            minStockLevel: minStock,
            currentStock: stock,
            searchKeywords: searchKeywords, 
            lastUpdated: serverTimestamp()
          });

          // Update Stats
          let currentTotalValue = 0;
          let currentTotalItems = 0;
          if (statsDoc.exists()) {
             currentTotalValue = statsDoc.data().totalInventoryValue || 0;
             currentTotalItems = statsDoc.data().totalItemsCount || 0;
          }

          const newValueVal = stock * price;

          transaction.set(statsRef, {
            totalInventoryValue: currentTotalValue + newValueVal,
            totalItemsCount: currentTotalItems + stock
          }, { merge: true });
        });
      });

      setMsg("Success: New Product Added!");
      setFormData({
        id: "",
        name: "",
        price: "",
        minStockLevel: 10,
        currentStock: 0,
      });
    } catch (error) {
      console.error(error);
      const errorMessage = typeof error === 'string' ? error : "Error saving product.";
      setMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card w-full bg-base-200 shadow-xl mb-6 p-6">
      <h2 className="card-title mb-4 text-gray-700">Product Manager</h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Barcode */}
        <div className="form-control">
          <label className="label py-1"><span className="label-text">Barcode / ISBN *</span></label>
          <input 
            type="text" 
            className="input input-bordered w-full font-mono" 
            value={formData.id} 
            onChange={e => setFormData({...formData, id: e.target.value})}
            placeholder="Scan to add..."
            required 
          />
        </div>

        {/* Product Name */}
        <div className="form-control">
          <label className="label py-1"><span className="label-text">Book Title *</span></label>
          <input 
            type="text" 
            className="input input-bordered w-full" 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder="e.g. Financial Accounting Vol 1"
            required 
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Price */}
          <div className="form-control">
            <label className="label py-1"><span className="label-text">Price (₱) *</span></label>
            <input 
              type="number" 
              min="0"
              step="0.01"
              className="input input-bordered w-full" 
              value={formData.price} 
              onChange={e => setFormData({...formData, price: e.target.value})}
              placeholder="0.00"
              required 
            />
          </div>
          
          {/* Min Stock */}
          <div className="form-control">
            <label className="label py-1"><span className="label-text">Min. Alert *</span></label>
            <input 
              type="number" 
              min="0"
              className="input input-bordered w-full" 
              value={formData.minStockLevel} 
              onChange={e => setFormData({...formData, minStockLevel: e.target.value})}
              required 
            />
          </div>
        </div>

        {/* Initial Stock */}
        <div className="form-control">
            <label className="label py-1"><span className="label-text">Set Stock Level *</span></label>
            <input 
              type="number" 
              min="0"
              className="input input-bordered w-full" 
              value={formData.currentStock} 
              onChange={e => setFormData({...formData, currentStock: e.target.value})}
              required 
            />
          </div>

        <button 
          disabled={loading} 
          type="submit" 
          className={`btn btn-primary w-full mt-4 shadow-sm ${loading ? 'loading' : ''}`}
        >
          {loading ? "Saving..." : "Save Product Details"}
        </button>
        
        {msg && <div className={`text-sm text-center font-bold mt-2 ${msg.includes('Error') ? 'text-error' : 'text-success'}`}>{msg}</div>}
      </form>
    </div>
  );
}