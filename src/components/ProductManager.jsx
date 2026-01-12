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

  // Check if product exists when Barcode is blurred (focus lost)
  const handleBarcodeBlur = async () => {
    if (!formData.id) return;
    setLoading(true);
    try {
      const docRef = doc(db, "products", formData.id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData(prev => ({
          ...prev,
          name: data.name,
          price: data.price,
          minStockLevel: data.minStockLevel,
          currentStock: data.currentStock
        }));
        setMsg("Found existing item. Switching to Edit Mode.");
      }
    } catch (error) {
      console.error("Error checking product:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      await setDoc(doc(db, "products", formData.id), {
        id: formData.id,
        name: formData.name,
        price: Number(formData.price),
        minStockLevel: Number(formData.minStockLevel),
        currentStock: Number(formData.currentStock),
        lastUpdated: serverTimestamp()
      }, { merge: true });

      setMsg("Success: Product Saved!");
      setFormData({
        id: "",
        name: "",
        price: "",
        minStockLevel: 10,
        currentStock: 0,
      });
    } catch (error) {
      console.error(error);
      setMsg("Error saving product.");
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
          <label className="label py-1"><span className="label-text">Barcode / ISBN</span></label>
          <input 
            type="text" 
            className="input input-bordered w-full font-mono" 
            value={formData.id} 
            onChange={e => setFormData({...formData, id: e.target.value})}
            onBlur={handleBarcodeBlur}
            placeholder="Scan to add or edit..."
            required 
          />
        </div>

        {/* Product Name */}
        <div className="form-control">
          <label className="label py-1"><span className="label-text">Book Title</span></label>
          <input 
            type="text" 
            className="input input-bordered w-full" 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})}
            required 
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Price */}
          <div className="form-control">
            <label className="label py-1"><span className="label-text">Price</span></label>
            <input 
              type="number" 
              className="input input-bordered w-full" 
              value={formData.price} 
              onChange={e => setFormData({...formData, price: e.target.value})}
              required 
            />
          </div>
          
          {/* Min Stock */}
          <div className="form-control">
            <label className="label py-1"><span className="label-text">Min. Alert</span></label>
            <input 
              type="number" 
              className="input input-bordered w-full" 
              value={formData.minStockLevel} 
              onChange={e => setFormData({...formData, minStockLevel: e.target.value})}
              required 
            />
          </div>
        </div>

        {/* Initial Stock */}
        <div className="form-control">
            <label className="label py-1"><span className="label-text">Set Stock Level</span></label>
            <input 
              type="number" 
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