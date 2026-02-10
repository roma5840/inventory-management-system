import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function StatsComprehensive({ lastUpdated }) {
  const { userRole } = useAuth();

  // Hide component entirely for non-admins
  if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) return null;

  // --- CONFIG: TEMPORARILY SET TO FALSE TO HIDE STATS ---
  const SHOW_SENSITIVE_METRICS = false; 

  // Default: Start of current month to Today
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [data, setData] = useState({
    beginning: { qty: 0, val: 0 },
    inflow: { qty: 0, val: 0 },
    outflow: { qty: 0, val: 0, revenue: 0 },
    ending: { qty: 0, val: 0 }
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      
      const startIso = new Date(`${dateRange.start}T00:00:00`).toISOString();
      const endIso = new Date(`${dateRange.end}T23:59:59.999`).toISOString();

      const { data: stats, error } = await supabase.rpc('get_period_stats', {
        start_date: startIso,
        end_date: endIso
      });

      if (!error && stats) {
        const currentQty = Number(stats.current_qty) || 0;
        const currentVal = Number(stats.current_val) || 0;
        const inQty = Number(stats.inflow_qty) || 0;
        const inCost = Number(stats.inflow_cost) || 0;
        const outQty = Number(stats.outflow_qty) || 0;
        const salesRev = Number(stats.sales_revenue) || 0;
        const cogs = Number(stats.cogs) || 0;

        // Formula: Beginning = Ending - Inflow + Outflow
        const begQty = currentQty - inQty + outQty;
        // Formula: BegValue = EndValue - InflowCost + OutflowCost(COGS)
        const begVal = currentVal - inCost + cogs;

        setData({
          beginning: { qty: begQty, val: begVal },
          inflow: { qty: inQty, val: inCost },
          outflow: { qty: outQty, val: cogs, revenue: salesRev },
          ending: { qty: currentQty, val: currentVal }
        });
      }
      setLoading(false);
    };

    fetchMetrics();
  }, [dateRange, lastUpdated]);

  // Helper for formatting currency
  const fmt = (num) => Number(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Operational Metrics</h2>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5 px-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period:</span>
            <input 
                type="date" 
                className="bg-transparent text-xs font-bold text-slate-600 outline-none border-none p-0 w-28"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <span className="text-slate-300 mx-1">—</span>
            <input 
                type="date" 
                className="bg-transparent text-xs font-bold text-slate-600 outline-none border-none p-0 w-28"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Beginning Inv", qty: data.beginning.qty, val: data.beginning.val, desc: "Stock at start of period" },
            { label: "Total Inflow", qty: data.inflow.qty, val: data.inflow.val, desc: "Purchases & Receiving" },
            { label: "Net Outflow", qty: data.outflow.qty, val: data.outflow.val, desc: "Sales & Pull-outs" },
            { label: "Ending Inv", qty: data.ending.qty, val: data.ending.val, desc: "Current Physical Record", active: true },
          ].map((box, i) => (
            <div key={i} className={`p-5 rounded-xl border ${box.active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-800 shadow-sm hover:border-slate-300'} transition-all`}>
                <div className={`text-[10px] font-black uppercase tracking-widest mb-3 ${box.active ? 'text-slate-400' : 'text-slate-400'}`}>
                    {box.label}
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tighter">{box.qty.toLocaleString()}</span>
                    <span className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Units</span>
                </div>
                {SHOW_SENSITIVE_METRICS && (
                    <div className={`mt-4 pt-3 border-t font-mono text-xs ${box.active ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
                       ₱ {fmt(box.val)}
                    </div>
                )}
            </div>
          ))}
      </div>
    </div>
  );
}