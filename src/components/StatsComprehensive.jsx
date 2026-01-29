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
    <div className="w-full mb-8 space-y-6">
      
      {/* 1. DATE RANGE CONTROLS (Compact & Professional) */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Start Date</span>
                <input 
                    type="date" 
                    className="input input-sm input-bordered w-36 text-gray-600 font-mono text-xs focus:outline-none focus:border-gray-400 transition-colors"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
            </div>
            
            <div className="pt-5 text-gray-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                </svg>
            </div>

            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">End Date</span>
                <input 
                    type="date" 
                    className="input input-sm input-bordered w-36 text-gray-600 font-mono text-xs focus:outline-none focus:border-gray-400 transition-colors"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                />
            </div>
        </div>

        <div className="mt-4 md:mt-0">
             {loading ? <span className="loading loading-dots loading-md text-gray-400"></span> : <span className="text-gray-300 text-xs uppercase font-bold tracking-widest">Live Metrics</span>}
        </div>
      </div>

      {/* 2. KPI CARDS (Sales, Cost, Asset Value) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Sales */}
        <div className="stat bg-white shadow-sm border border-gray-200 rounded-lg" title="Sum of (Qty Sold × Price at moment of sale)">
            <div className="stat-title font-bold text-gray-500 uppercase text-xs tracking-wider">Total Sales</div>
            <div className="stat-value text-gray-800 text-2xl">₱{fmt(data.outflow.revenue)}</div>
            <div className="stat-desc text-xs mt-1 text-gray-400">Revenue for selected period</div>
        </div>

        {/* Total Cost */}
        <div className="stat bg-white shadow-sm border border-gray-200 rounded-lg" title="Sum of (Qty Sold × Unit Cost at moment of sale)">
            <div className="stat-title font-bold text-gray-500 uppercase text-xs tracking-wider">Total Cost (COGS)</div>
            <div className="stat-value text-gray-800 text-2xl">₱{fmt(data.outflow.val)}</div>
            <div className="stat-desc text-xs mt-1 text-gray-400">Cost of Goods Sold</div>
        </div>

        {/* Total Inventory Value */}
        <div className="stat bg-white shadow-sm border border-gray-200 rounded-lg" title="Current Stock × Current Supplier Cost">
            <div className="stat-title font-bold text-gray-500 uppercase text-xs tracking-wider">Current Asset Value</div>
            <div className="stat-value text-gray-800 text-2xl">₱{fmt(data.ending.val)}</div>
            <div className="stat-desc text-xs mt-1 text-gray-400">Total Inventory Value as of Period End</div>
        </div>
      </div>

      {/* 3. BOSS'S FORMULA FLOW (The 4 Boxes) */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Inventory Reconciliation</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Box 1: Beginning */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm" title="Ending - Inflow + Outflow">
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Beginning Inv</div>
                <div className="text-xl font-bold text-gray-700">{data.beginning.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">Est: ₱{fmt(data.beginning.val)}</div>
            </div>

            {/* Box 2: Inflow */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm" title="Receiving + Returns">
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Total Inflow</div>
                <div className="text-xl font-bold text-gray-700">{data.inflow.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">Cost: ₱{fmt(data.inflow.val)}</div>
            </div>

            {/* Box 3: Outflow */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm" title="Issuances + Pull Outs">
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Total Outflow</div>
                <div className="text-xl font-bold text-gray-700">{data.outflow.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">Cost: ₱{fmt(data.outflow.val)}</div>
            </div>

            {/* Box 4: Ending */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm" title="Current Physical Count in System">
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 tracking-wider">Ending Inv</div>
                <div className="text-xl font-bold text-gray-900">{data.ending.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                <div className="text-xs font-mono mt-1 text-gray-600 border-t border-gray-200 pt-1">Val: ₱{fmt(data.ending.val)}</div>
            </div>
        </div>
      </div>

    </div>
  );
}