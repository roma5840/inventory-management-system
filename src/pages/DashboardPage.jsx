import { useState, useEffect } from "react";
import { query, collection, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

// Components moved here
import Navbar from "../components/Navbar";
import Stats from "../components/Stats";
import TransactionForm from "../components/TransactionForm";
import AdminInvite from "../components/AdminInvite";
import Dashboard from "../components/Dashboard";
import TransactionHistory from "../components/TransactionHistory";
import ProductManager from "../components/ProductManager";

export default function DashboardPage() {
  const { currentUser, userRole } = useAuth();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch logic moved from App.jsx
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, "products"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(items);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching products:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4">
        <Stats />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
               <TransactionForm />

               {userRole === 'ADMIN' && (
                 <>
                   <ProductManager />
                   <AdminInvite />
                 </>
               )}
               
               <div className="card w-full bg-base-200 shadow-xl mt-6 p-6">
                 <h3 className="card-title text-gray-700 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-2">
                   <li>Click <strong>"Scan Barcode"</strong> to start.</li>
                   <li><strong>Receiving:</strong> New stock from Supplier (+).</li>
                   <li><strong>Issuance:</strong> Sale/Distribution to Student (-).</li>
                   <li><strong>Issuance Return:</strong> Return to Shelf (+).</li>
                   <li><strong>Pull Out:</strong> Defective/Vendor Return (-).</li>
                 </ul>
               </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <TransactionHistory /> 
            <Dashboard />
          </div>

        </div>
      </main>
    </div>
  );
}