import { useState } from "react";
import { useInventory } from "../hooks/useInventory";

export default function TransactionForm() {
  const { processTransaction, loading, error } = useInventory();
  
  const [formData, setFormData] = useState({
    barcode: "",
    qty: 1,
    type: "ISSUANCE" // Default to the most common action (Selling/Issuing)
  });
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg("");

    const success = await processTransaction(
      formData.barcode, 
      formData.type, 
      formData.qty
    );

    if (success) {
      setSuccessMsg(`Success: ${formData.type} processed.`);
      setFormData(prev => ({ ...prev, barcode: "", qty: 1 })); 
    }
  };

  return (
    <div className="card w-full max-w-lg bg-base-200 shadow-xl m-4 p-6">
      <h2 className="card-title mb-4">Inventory Movement</h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        
        {/* Transaction Type Selector (Dropdown for 4 types) */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Transaction Type</span>
          </label>
          <select 
            className="select select-bordered w-full" 
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            <option value="ISSUANCE">Issuance / Shipment (Out)</option>
            <option value="RECEIVING">Receiving (In)</option>
            <option value="ISSUANCE_RETURN">Issuance Return (In)</option>
            <option value="PULL_OUT">Return / Pull Out (Out)</option>
          </select>
        </div>

        {/* Barcode Input - Auto-focus this for scanners */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Scan Barcode</span>
          </label>
          <input 
            type="text" 
            placeholder="Scan or type..." 
            className="input input-bordered w-full font-mono" 
            value={formData.barcode}
            onChange={(e) => setFormData({...formData, barcode: e.target.value})}
            autoFocus
            required
          />
        </div>

        {/* Quantity */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Quantity</span>
          </label>
          <input 
            type="number" 
            min="1"
            className="input input-bordered w-full" 
            value={formData.qty}
            onChange={(e) => setFormData({...formData, qty: e.target.value})}
            required
          />
        </div>

        {/* Feedback Messages */}
        {error && <div className="alert alert-error text-sm">{error}</div>}
        {successMsg && <div className="alert alert-success text-sm">{successMsg}</div>}

        <button 
          type="submit" 
          className={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
          disabled={loading}
        >
          {loading ? "Processing..." : "Submit Transaction"}
        </button>
      </form>
    </div>
  );
}