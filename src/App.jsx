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
  }, [currentUser]); // Dependency ensures this reruns when login state changes


  // --- AUTH PROTECTION ---
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
               
               {/* Transaction Form (Visible to All Staff) */}
               <TransactionForm />

               {/* Admin Modules (Visible only to Admin) */}
               {userRole === 'ADMIN' && (
                 <>
                   <ProductManager />
                   <AdminInvite />
                 </>
               )}
               
               {/* Instructions Card - Updated Style */}
               <div className="card w-full bg-base-200 shadow-xl mt-6 p-6">
                 <h3 className="card-title text-gray-700 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-2">
                   <li>Click <strong>"Scan Barcode"</strong> to start.</li>
                   <li>Use handheld scanner or type ISBN.</li>
                   <li><strong>Issuance:</strong> Reduces stock (Sale).</li>
                   <li><strong>Receiving:</strong> Adds stock (Delivery).</li>
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