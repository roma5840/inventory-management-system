import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time listener for the last 10 transactions
    const q = query(
      collection(db, "transactions"),
      orderBy("timestamp", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(trans);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatDate = (timestamp) => {
    if (!timestamp) return "Pending...";
    // Convert Firestore Timestamp to JS Date
    return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getBadgeColor = (type) => {
    switch (type) {
      case 'RECEIVING': return 'badge-success text-white'; 
      case 'ISSUANCE_RETURN': return 'badge-info text-white'; 
      case 'ISSUANCE': return 'badge-error text-white'; 
      case 'PULL_OUT': return 'badge-warning'; 
      default: return 'badge-ghost';
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl mt-8">
      <div className="card-body p-0">
        <div className="p-4 border-b bg-gray-50 rounded-t-xl">
          <h2 className="card-title text-lg text-gray-700">Recent Transactions</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-xs w-full">
            <thead className="bg-base-200">
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Product</th>
                <th className="text-center">Qty</th>
                <th className="text-right">History</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-6 text-gray-400">No recent activity.</td></tr>
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
      </div>
    </div>
  );
}