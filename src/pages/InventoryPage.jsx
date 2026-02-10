import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/Sidebar";
import InventoryTable from "../components/InventoryTable";

export default function InventoryPage() {
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
            
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory</h1>
                <p className="text-sm text-slate-500">Monitor stock levels, register products, and manage the bookstore catalog.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <InventoryTable lastUpdated={refreshTrigger} />
            </div>
        </div>
      </main>
    </div>
  );
}