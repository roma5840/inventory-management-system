import { useState, useEffect } from "react";
import { query, collection, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "./lib/firebase";
import { useAuth } from "./context/AuthContext";
import ProductManager from "./components/ProductManager"; 

import Navbar from "./components/Navbar";
import Stats from "./components/Stats";
import TransactionForm from "./components/TransactionForm";
import AdminInvite from "./components/AdminInvite";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import Register from "./components/Register";

export default function App() {
  const { currentUser, userRole } = useAuth(); 
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);

  // --- FIX: USEEFFECT MOVED TO TOP (Before any return statements) ---
  useEffect(() => {
    // Only fetch data if the user is actually logged in
    if (!currentUser) {
      setProducts([]); // Clear data if logged out
      return;
    }

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
  }, [currentUser]); // Dependency ensures this re-runs when login state changes


  // --- AUTH PROTECTION (Now safe to return early) ---
  if (!currentUser) {
    if (isRegistering) {
      return <Register onSwitchToLogin={() => setIsRegistering(false)} />;
    } else {
      return <Login onSwitchToRegister={() => setIsRegistering(true)} />;
    }
  }

  // --- MAIN APP UI ---
  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4">
        {/* Top Section: Statistics */}
        <Stats products={products} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
               
               {/* 1. Transaction Form (Visible to All Staff) */}
               <TransactionForm />

               {/* 2. Admin Modules (Visible only to Admin) */}
               {userRole === 'ADMIN' && (
                 <>
                   <ProductManager />
                   <AdminInvite />
                 </>
               )}
               
               {/* Instructions Card */}
               <div className="card bg-base-100 shadow mt-6 p-4">
                 <h3 className="font-bold text-gray-500 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-1">
                   <li>Click "Scan Barcode" input.</li>
                   <li>Use handheld scanner or type ID.</li>
                   <li>"Issuance" reduces stock.</li>
                   <li>"Receiving" increases stock.</li>
                 </ul>
               </div>
            </div>
          </div>

          {/* RIGHT COLUMN: DATA AREA */}
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="flex justify-center p-10">
                <span className="loading loading-spinner loading-lg text-primary"></span>
              </div>
            ) : (
              <Dashboard products={products} />
            )}
          </div>

        </div>
      </main>
    </div>
  );
}