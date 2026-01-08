import { useEffect, useState } from "react";
import { db } from "./lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import Navbar from "./components/Navbar";
import Stats from "./components/Stats";
import TransactionForm from "./components/TransactionForm";
import Dashboard from "./components/Dashboard";

function App() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // GLOBAL DATA FETCHING
  // Fetch here so both the Stats card and the Table share the exact same data
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("name"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(items);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4">
        {/* Top Section: Statistics */}
        <Stats products={products} />

        {/* Main Grid: Input on Left (or Top on mobile), Data on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: ACTION AREA */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
               <TransactionForm />
               
               {/* Instructions Card */}
               <div className="card bg-base-100 shadow mt-6 p-4">
                 <h3 className="font-bold text-gray-500 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-1">
                   <li>Click "Scan Barcode" input.</li>
                   <li>Use handheld scanner or type ID.</li>
                   <li>"Sale" reduces stock.</li>
                   <li>"Receive" increases stock.</li>
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

export default App;