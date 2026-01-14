import { useEffect, useState } from "react";
import { doc, onSnapshot, getDocs, collection, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export default function Stats() {
  const { userRole } = useAuth();
  const [stats, setStats] = useState({ 
    totalInventoryValue: 0, 
    totalItemsCount: 0, 
    lowStockCount: 0 
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "stats", "summary"), (doc) => {
      if (doc.exists()) {
        setStats(doc.data());
      }
    });
    return () => unsub();
  }, []);

  // One-time migration function to fix "0" values
  const recalculateTotals = async () => {
    if (!confirm("Recalculate all stats? This reads all products.")) return;
    setUpdating(true);
    try {
      const snapshot = await getDocs(collection(db, "products"));
      let totalVal = 0;
      let totalCount = 0;
      let lowStock = 0;

      snapshot.forEach(doc => {
        const d = doc.data();
        const stock = Number(d.currentStock) || 0;
        const price = Number(d.price) || 0;
        const min = Number(d.minStockLevel) || 10;

        totalVal += (stock * price);
        totalCount += stock;
        if (stock <= min) lowStock++;
      });

      await setDoc(doc(db, "stats", "summary"), {
        totalInventoryValue: totalVal,
        totalItemsCount: totalCount,
        lowStockCount: lowStock,
        lastCalculated: serverTimestamp()
      });
      alert("Stats updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to update.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="stats shadow w-full mb-6 bg-white relative">
      {/* Admin-only Recalculate Button */}
      {userRole === 'ADMIN' && (
        <button 
          onClick={recalculateTotals}
          disabled={updating}
          className="btn btn-xs btn-circle btn-ghost absolute top-2 right-2 text-gray-400 tooltip tooltip-left"
          data-tip="Force Recalculate Stats"
        >
          {updating ? "..." : "↻"}
        </button>
      )}

      <div className="stat">
        <div className="stat-figure text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <div className="stat-title">Total Inventory Value</div>
        <div className="stat-value text-primary">₱{(stats.totalInventoryValue || 0).toLocaleString()}</div>
        <div className="stat-desc">Current Assets on Hand</div>
      </div>
      
      <div className="stat">
        <div className="stat-figure text-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
        </div>
        <div className="stat-title">Total Units</div>
        <div className="stat-value text-secondary">{(stats.totalItemsCount || 0).toLocaleString()}</div>
        <div className="stat-desc">Individual books/items</div>
      </div>

      <div className="stat">
        <div className="stat-figure text-error">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <div className="stat-title">Low Stock Alerts</div>
        <div className="stat-value text-error">{stats.lowStockCount || 0}</div>
        <div className="stat-desc text-error font-bold">Requires Attention</div>
      </div>
    </div>
  );
}