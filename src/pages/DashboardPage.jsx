import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

import TransactionForm from "../components/TransactionForm";
import TransactionHistory from "../components/TransactionHistory";
import ReceiptLookup from "../components/ReceiptLookup";
import StatsComprehensive from "../components/StatsComprehensive"; 
import QuickStockCheck from "../components/QuickStockCheck";
import LowStockAlert from "../components/LowStockAlert";
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
            
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">DASHBOARD</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Manage bookstore transactions and view realtime operations.</p>
            </div>

            <StatsComprehensive key={refreshTrigger} lastUpdated={refreshTrigger} />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              {/* Left: Transaction Entry (The Primary Workspace) */}
              <div className="xl:col-span-8 space-y-6">
                <TransactionForm onSuccess={handleRefresh} />
              </div>

              {/* Right: Quick Tools */}
              <div className="xl:col-span-4 flex flex-col gap-6">
                <QuickStockCheck />
                
                <ReceiptLookup />
                
                <LowStockAlert refreshTrigger={refreshTrigger} />
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