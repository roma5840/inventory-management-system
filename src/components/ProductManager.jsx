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
        setMsg("Product found. Editing mode.");
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
      // We use the Barcode (formData.id) as the Firestore Document ID
      await setDoc(doc(db, "products", formData.id), {
        id: formData.id,
        name: formData.name,
        price: Number(formData.price),
        minStockLevel: Number(formData.minStockLevel),
        currentStock: Number(formData.currentStock), // Initial stock
        lastUpdated: serverTimestamp()
      }, { merge: true }); // Merge true allows updating existing fields without wiping others

      setMsg("Success: Product Saved!");
      // Reset form
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
    <div className="card bg-white shadow p-4 mb-6">
      <h3 className="font-bold text-gray-700 mb-2 border-b pb-2">Product Manager (Admin)</h3>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Barcode - The Key Identifier */}
        <div className="form-control">
          <label className="label py-0"><span className="label-text text-xs">Barcode / ISBN</span></label>
          <input 
            type="text" 
            className="input input-bordered input-sm font-mono" 
            value={formData.id} 
            onChange={e => setFormData({...formData, id: e.target.value})}
            onBlur={handleBarcodeBlur} // checks DB when user leaves this field
            placeholder="Scan here..."
            required 
          />
        </div>

        {/* Product Name */}
        <div className="form-control">
          <label className="label py-0"><span className="label-text text-xs">Book Title</span></label>
          <input 
            type="text" 
            className="input input-bordered input-sm" 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})}
            required 
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Price */}
          <div className="form-control">
            <label className="label py-0"><span className="label-text text-xs">Price</span></label>
            <input 
              type="number" 
              className="input input-bordered input-sm" 
              value={formData.price} 
              onChange={e => setFormData({...formData, price: e.target.value})}
              required 
            />
          </div>
          
          {/* Min Stock */}
          <div className="form-control">
            <label className="label py-0"><span className="label-text text-xs">Min. Alert</span></label>
            <input 
              type="number" 
              className="input input-bordered input-sm" 
              value={formData.minStockLevel} 
              onChange={e => setFormData({...formData, minStockLevel: e.target.value})}
              required 
            />
          </div>
        </div>

        {/* Initial Stock - Only used for new items or manual override */}
        <div className="form-control">
            <label className="label py-0"><span className="label-text text-xs">Initial/Current Stock</span></label>
            <input 
              type="number" 
              className="input input-bordered input-sm" 
              value={formData.currentStock} 
              onChange={e => setFormData({...formData, currentStock: e.target.value})}
              required 
            />
          </div>

        <button disabled={loading} type="submit" className="btn btn-sm btn-accent text-white mt-2">
          {loading ? "Saving..." : "Save Product"}
        </button>
        
        {msg && <span className={`text-xs text-center ${msg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</span>}
      </form>
    </div>
  );
}