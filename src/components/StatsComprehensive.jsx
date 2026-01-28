import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function StatsComprehensive({ lastUpdated }) {
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
      
      const startIso = new Date(dateRange.start).toISOString();
      // Ensure End Date covers the full day (23:59:59)
      const endObj = new Date(dateRange.end);
      endObj.setHours(23, 59, 59, 999);
      const endIso = endObj.toISOString();

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
    <div className="w-full mb-8 space-y-6">
      
      {/* 1. DATE RANGE CONTROLS (Compact & Professional) */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-md border border-gray-200">
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Start Date</span>
                <input 
                    type="date" 
                    className="input input-xs input-ghost font-mono focus:outline-none"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
            </div>
            <span className="text-gray-300">➜</span>
            <div className="flex flex-col text-right">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">End Date</span>
                <input 
                    type="date" 
                    className="input input-xs input-ghost font-mono text-right focus:outline-none"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                />
            </div>
        </div>

        <div className="mt-2 md:mt-0">
             {loading ? <span className="loading loading-dots loading-md text-primary"></span> : <span className="text-gray-300 text-xs uppercase font-bold tracking-widest">Live Metrics</span>}
        </div>
      </div>

      {/* 2. KPI CARDS (Sales, Cost, Asset Value) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Sales */}
        <div className="stat bg-white shadow-md border-t-4 border-green-500 rounded-lg" title="Sum of (Qty Sold × Price at moment of sale)">
            <div className="stat-figure text-green-500 opacity-20">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-12 h-12 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <div className="stat-title font-bold text-gray-500 uppercase text-xs tracking-wider">Total Sales</div>
            <div className="stat-value text-green-600 text-2xl">₱{fmt(data.outflow.revenue)}</div>
            <div className="stat-desc text-xs mt-1">Revenue for selected period</div>
        </div>

        {/* Total Cost */}
        <div className="stat bg-white shadow-md border-t-4 border-red-500 rounded-lg" title="Sum of (Qty Sold × Unit Cost at moment of sale)">
            <div className="stat-figure text-red-500 opacity-20">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-12 h-12 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <div className="stat-title font-bold text-gray-500 uppercase text-xs tracking-wider">Total Cost (COGS)</div>
            <div className="stat-value text-red-600 text-2xl">₱{fmt(data.outflow.val)}</div>
            <div className="stat-desc text-xs mt-1">Cost of Goods Sold</div>
        </div>

        {/* Total Inventory Value */}
        <div className="stat bg-white shadow-md border-t-4 border-blue-500 rounded-lg" title="Current Stock × Current Supplier Cost">
            <div className="stat-figure text-blue-500 opacity-20">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-12 h-12 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
            <div className="stat-title font-bold text-gray-500 uppercase text-xs tracking-wider">Current Asset Value</div>
            <div className="stat-value text-blue-600 text-2xl">₱{fmt(data.ending.val)}</div>
            <div className="stat-desc text-xs mt-1">Total Inventory Value (Now)</div>
        </div>
      </div>

      {/* 3. BOSS'S FORMULA FLOW (The 4 Boxes) */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Inventory Reconciliation</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Box 1: Beginning */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 relative overflow-hidden" title="Ending - Inflow + Outflow">
                <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-4xl text-gray-400">1</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 tracking-wider">Beginning Inv</div>
                <div className="text-xl font-bold text-gray-700">{data.beginning.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-500 border-t border-gray-200 pt-1">Est: ₱{fmt(data.beginning.val)}</div>
            </div>

            {/* Box 2: Inflow */}
            <div className="bg-white p-4 rounded-lg border-l-4 border-l-emerald-400 shadow-sm relative overflow-hidden" title="Total Receiving + Returns">
                <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-4xl text-emerald-400">+</div>
                <div className="text-[10px] text-emerald-700 uppercase font-bold mb-1 tracking-wider">Purchases (In)</div>
                <div className="text-xl font-bold text-gray-700">{data.inflow.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">Cost: ₱{fmt(data.inflow.val)}</div>
            </div>

            {/* Box 3: Outflow */}
            <div className="bg-white p-4 rounded-lg border-l-4 border-l-rose-400 shadow-sm relative overflow-hidden" title="Total Sales + Issuances + Pull Outs">
                <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-4xl text-rose-400">-</div>
                <div className="text-[10px] text-rose-700 uppercase font-bold mb-1 tracking-wider">Sold/Out (Out)</div>
                <div className="text-xl font-bold text-gray-700">{data.outflow.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">Cost: ₱{fmt(data.outflow.val)}</div>
            </div>

            {/* Box 4: Ending */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 relative overflow-hidden" title="Current Physical Count in System">
                <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-4xl text-blue-400">=</div>
                <div className="text-[10px] text-blue-800 uppercase font-bold mb-1 tracking-wider">Ending Inv</div>
                <div className="text-xl font-bold text-blue-900">{data.ending.qty.toLocaleString()} <span className="text-xs font-normal text-blue-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-blue-600 border-t border-blue-200 pt-1">Val: ₱{fmt(data.ending.val)}</div>
            </div>
        </div>
      </div>

    </div>
  );
}