import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase"; // Added Import

// Components moved here
import Navbar from "../components/Navbar";
import Stats from "../components/Stats";
import TransactionForm from "../components/TransactionForm";
import AdminInvite from "../components/AdminInvite";
import Dashboard from "../components/Dashboard";
import TransactionHistory from "../components/TransactionHistory";

export default function DashboardPage() {
  const { userRole } = useAuth();
  // State to force re-fetch of child components
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // NEW: Listen for "inventory_update" broadcast from other tabs
  useEffect(() => {
    const channel = supabase.channel('app_updates')
      .on('broadcast', { event: 'inventory_update' }, () => {
        console.log("Remote update received. Refreshing data...");
        handleRefresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4">
        {/* Pass refreshTrigger so Stats re-calculates immediately */}
        <Stats key={refreshTrigger} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
               {/* Pass handleRefresh as onSuccess callback */}
               <TransactionForm onSuccess={handleRefresh} />
               
               <div className="card w-full bg-base-200 shadow-xl mt-6 p-6">
                 <h3 className="card-title text-gray-700 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-2">
                   <li><strong>Receiving:</strong> Stock In. Fills Name/Price if item is new.</li>
                   <li><strong>Issuance:</strong> Stock Out to Student/Dept.</li>
                   <li><strong>Return:</strong> Student returns item to shelf.</li>
                   <li><strong>Pull Out:</strong> Defective item sent back to supplier.</li>
                 </ul>
               </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <TransactionHistory 
              lastUpdated={refreshTrigger} 
              onUpdate={handleRefresh} 
            /> 
            <Dashboard lastUpdated={refreshTrigger} />
          </div>

        </div>
      </main>
    </div>
  );
}