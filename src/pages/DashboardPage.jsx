import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase"; // Added Import

// Components moved here
import Navbar from "../components/Navbar";
import TransactionForm from "../components/TransactionForm";
import AdminInvite from "../components/AdminInvite";
import Dashboard from "../components/Dashboard";
import TransactionHistory from "../components/TransactionHistory";
import ReceiptLookup from "../components/ReceiptLookup";
import StatsComprehensive from "../components/StatsComprehensive"; 

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
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar />
      
      <main className="container mx-auto px-4 flex-grow pb-10">
        {/* Pass refreshTrigger so Stats re-calculates immediately */}
        <StatsComprehensive key={refreshTrigger} lastUpdated={refreshTrigger} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
               {/* Pass handleRefresh as onSuccess callback */}
               <TransactionForm onSuccess={handleRefresh} />
               
               <ReceiptLookup />

               {/* <div className="card w-full bg-base-200 shadow-xl mt-6 p-6">
                 <h3 className="card-title text-gray-700 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-2">
                   <li><strong>Receiving:</strong> Stock In. Fills Name/Price if item is new.</li>
                   <li><strong>Issuance:</strong> Stock Out to Student/Dept.</li>
                   <li><strong>Return:</strong> Student returns item to shelf.</li>
                   <li><strong>Pull Out:</strong> Defective item sent back to supplier.</li>
                 </ul>
               </div> */}
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

      {/* FOOTER SECTION */}
      <footer className="mt-auto py-10 bg-white border-t border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            {/* Main Branding */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-gray-300"></div>
              <span className="text-xs font-bold tracking-[0.2em] text-gray-500 uppercase">
                Finance Department &bull; University of Pangasinan
              </span>
              <div className="h-px w-8 bg-gray-300"></div>
            </div>

            {/* Development Credits */}
            {/* <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-[11px] text-gray-400">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-500">Systems Lead:</span>
                <span>Ryan Oliver Aquino</span>
              </div>
              <div className="hidden sm:block w-1 h-1 rounded-full bg-gray-300"></div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-500">Operations & PR:</span>
                <span>Jancesar Pocoholo Taguiang</span>
              </div>
            </div> */}

            {/* Project Context */}
            {/* <p className="mt-4 text-[10px] text-gray-400 italic">
              Internal Inventory Management System &mdash; Student Internship Project 2026
            </p> */}
          </div>
        </div>
      </footer>

    </div>
  );
}