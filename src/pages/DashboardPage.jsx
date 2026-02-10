import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

import TransactionForm from "../components/TransactionForm";
import AdminInvite from "../components/AdminInvite";
import TransactionHistory from "../components/TransactionHistory";
import ReceiptLookup from "../components/ReceiptLookup";
import StatsComprehensive from "../components/StatsComprehensive"; 
import Sidebar from "../components/Sidebar";

export default function DashboardPage() {
  const { userRole } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  useEffect(() => {
    const channel = supabase.channel('app_updates')
      .on('broadcast', { event: 'inventory_update' }, handleRefresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            
            {/* Cleaner Page Title Replacement for Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
                <p className="text-sm text-slate-500">Manage bookstore transactions and view real-time operations.</p>
            </div>

            <StatsComprehensive key={refreshTrigger} lastUpdated={refreshTrigger} />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              {/* Left: Transaction Entry (The Primary Workspace) */}
              <div className="xl:col-span-8 space-y-6">
                <TransactionForm onSuccess={handleRefresh} />
              </div>

              {/* Right: Quick Tools */}
              <div className="xl:col-span-4 space-y-6">
                <ReceiptLookup />
                
                {/* Help & Guide Card */}
                <div className="card bg-white border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="bg-blue-50 p-2 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Operational Guide</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">1</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Select <b>Transaction Type</b> at the top of the form.</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">2</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Scan <b>Barcode</b>.</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">3</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Adjust <b>Qty</b> and press <b>Enter</b> again to add to the batch list.</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">4</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Click <b>Confirm Batch</b> once all items are listed to save the transaction.</p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-tight">
                      <span>Keyboard Shortcut:</span>
                      <div className="flex gap-1">
                        <kbd className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 font-mono">ENTER</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: Activity Log (Full Width for Table readability) */}
              <div className="xl:col-span-12">
                <TransactionHistory lastUpdated={refreshTrigger} onUpdate={handleRefresh} /> 
              </div>
            </div>
        </div>
      </main>
    </div>
  );
}