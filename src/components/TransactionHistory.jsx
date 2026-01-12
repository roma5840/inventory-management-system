import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, orderBy, limit, getDocs, startAfter, where, Timestamp } from "firebase/firestore";

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);

  // Initial Fetch (Defaults to Today's data)
  useEffect(() => {
    fetchTransactions(true);
  }, []);

  const fetchTransactions = async (isInitial = false) => {
    setLoading(true);
    try {
      const collectionRef = collection(db, "transactions");
      
      // Calculate start of today for filtering
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Timestamp.fromDate(today);

      let q;

      if (isInitial) {
        // Query: Get transactions from today onwards, ordered by newest first, limit 10
        q = query(
          collectionRef,
          where("timestamp", ">=", todayTimestamp),
          orderBy("timestamp", "desc"),
          limit(10)
        );
      } else {
        // Pagination query using the last document cursor
        q = query(
          collectionRef,
          where("timestamp", ">=", todayTimestamp),
          orderBy("timestamp", "desc"),
          startAfter(lastDoc),
          limit(10)
        );
      }

      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setIsEmpty(true);
      } else {
        const newTrans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        setTransactions(prev => isInitial ? newTrans : [...prev, ...newTrans]);
      }

    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "Pending...";
    return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getBadgeColor = (type) => {
    switch (type) {
      case 'RECEIVING': return 'badge-success text-white'; // Stock Up
      case 'ISSUANCE_RETURN': return 'badge-info text-white'; // Stock Up
      case 'ISSUANCE': return 'badge-error text-white'; // Stock Down
      case 'PULL_OUT': return 'badge-warning'; // Stock Down
      default: return 'badge-ghost';
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl mt-8">
      <div className="card-body p-0">
        <div className="p-4 border-b bg-gray-50 rounded-t-xl flex justify-between items-center">
          <h2 className="card-title text-lg text-gray-700">
            Transaction History (Today)
          </h2>
          <button 
            onClick={() => fetchTransactions(true)} 
            className="btn btn-xs btn-ghost"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="table table-xs w-full">
            <thead className="bg-base-200 sticky top-0 z-10">
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Product</th>
                <th className="text-center">Qty</th>
                <th className="text-right">Stock Impact</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-6 text-gray-400">
                    No transactions recorded today.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover">
                    <td className="font-mono text-gray-500">{formatDate(t.timestamp)}</td>
                    <td>
                      <div className={`badge badge-xs ${getBadgeColor(t.type)}`}>
                        {t.type.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="max-w-xs truncate font-semibold" title={t.productName}>
                      {t.productName}
                    </td>
                    <td className="text-center font-bold">{t.qty}</td>
                    <td className="text-right font-mono text-xs">
                       {t.previousStock} → {t.newStock}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Button */}
        {!isEmpty && transactions.length > 0 && (
          <div className="p-2 border-t text-center">
            <button 
              onClick={() => fetchTransactions(false)} 
              className={`btn btn-sm btn-ghost text-primary w-full ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              Load Older Transactions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}