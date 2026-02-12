import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import Pagination from "./Pagination"; // Import added

export default function StatsComprehensive({ lastUpdated }) {
  const { userRole } = useAuth();
  if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) return null;

  const SHOW_SENSITIVE_METRICS = false; 
  const LOW_STOCK_PER_PAGE = 30;

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

  // --- Low Stock States ---
  const [lowStockCount, setLowStockCount] = useState(0);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalPage, setModalPage] = useState(1);

  // 1. LIGHTWEIGHT COUNT: Uses server-side RPC to avoid fetching the whole table
  // Requires: get_low_stock_count() SQL function
  useEffect(() => {
    const fetchFullCatalogCount = async () => {
        const { data, error } = await supabase.rpc('get_low_stock_count');
        
        if (!error && typeof data === 'number') {
            setLowStockCount(data);
        }
    };
    
    fetchFullCatalogCount();
  }, [lastUpdated]);

  // 2. DETAILED FETCH: Uses server-side RPC for pagination
  // Requires: get_low_stock_list(limit_val, offset_val) SQL function
  useEffect(() => {
    if (!showLowStockModal) return;

    const fetchDetailedLowStock = async () => {
        setModalLoading(true);
        
        const { data, error } = await supabase.rpc('get_low_stock_list', {
            limit_val: LOW_STOCK_PER_PAGE,
            offset_val: (modalPage - 1) * LOW_STOCK_PER_PAGE
        });

        if (!error && data) {
            setModalData(data);
        } else {
            setModalData([]);
        }
        
        setModalLoading(false);
    };

    fetchDetailedLowStock();
  }, [showLowStockModal, modalPage, lastUpdated]);

  // General Metrics Fetch
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
        const outQty = Number(stats.outflow_qty) || 0;
        const cogs = Number(stats.cogs) || 0;

        setData({
          beginning: { qty: currentQty - inQty + outQty, val: currentVal - (Number(stats.inflow_cost) || 0) + cogs },
          inflow: { qty: inQty, val: Number(stats.inflow_cost) || 0 },
          outflow: { qty: outQty, val: cogs, revenue: Number(stats.sales_revenue) || 0 },
          ending: { qty: currentQty, val: currentVal }
        });
      }
      setLoading(false);
    };
    fetchMetrics();
  }, [dateRange, lastUpdated]);

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
            { label: "Beginning Inv", qty: data.beginning.qty, val: data.beginning.val },
            { label: "Total Inflow", qty: data.inflow.qty, val: data.inflow.val },
            { label: "Net Outflow", qty: data.outflow.qty, val: data.outflow.val },
            { label: "Ending Inv", qty: data.ending.qty, val: data.ending.val, active: true },
          ].map((box, i) => (
            <div key={i} className={`relative p-5 rounded-xl border ${box.active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-800 shadow-sm'} transition-all`}>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
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
                
                {box.active && lowStockCount > 0 && (
                   <button 
                     onClick={() => { setModalPage(1); setShowLowStockModal(true); }}
                     className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-lg shadow-rose-900/40 transition-all active:scale-95"
                   >
                     <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                     <span className="text-[10px] font-bold uppercase tracking-tight">{lowStockCount} Low</span>
                   </button>
                )}
            </div>
          ))}
      </div>

      {showLowStockModal && (
        <div className="modal modal-open">
          <div className="modal-box w-11/12 max-w-5xl bg-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg text-slate-800">Critical Stock Report</h3>
                    <p className="text-xs text-slate-500">Inventory items at or below minimum alert levels</p>
                </div>
                <button onClick={() => setShowLowStockModal(false)} className="btn btn-sm btn-circle btn-ghost">✕</button>
            </div>
            
            <div className="flex-1 overflow-auto">
                <table className="table table-sm w-full">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 z-10">
                        <tr className="text-[10px] uppercase">
                            <th>Barcode</th>
                            <th>Product Name</th>
                            <th>Location</th>
                            <th className="text-center">Min</th>
                            <th className="text-center">Current</th>
                            <th className="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {modalLoading ? (
                            <tr><td colSpan="6" className="text-center py-10"><span className="loading loading-spinner text-primary"></span></td></tr>
                        ) : modalData.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-10 text-slate-400">No items found.</td></tr>
                        ) : (
                            modalData.map(item => (
                                <tr key={item.internal_id} className="hover:bg-slate-50 border-slate-100">
                                    <td className="font-mono text-[11px] text-slate-500">{item.barcode}</td>
                                    <td className="font-medium text-xs text-slate-700 truncate max-w-xs">{item.name}</td>
                                    <td className="text-[11px] text-slate-500">{item.location || 'N/A'}</td>
                                    <td className="text-center text-xs text-slate-400 font-bold">{item.min_stock_level}</td>
                                    <td className="text-center font-bold text-rose-600">{item.current_stock}</td>
                                    <td className="text-center">
                                        <span className={`px-2 py-0.5 rounded-[4px] text-[9px] font-black uppercase ${item.current_stock <= 0 ? 'bg-slate-100 text-slate-500' : 'bg-rose-100 text-rose-700'}`}>
                                            {item.current_stock <= 0 ? 'Out of Stock' : 'Low Stock'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-slate-50">
                <Pagination 
                    totalCount={lowStockCount}
                    itemsPerPage={LOW_STOCK_PER_PAGE}
                    currentPage={modalPage}
                    onPageChange={(p) => setModalPage(p)}
                    loading={modalLoading}
                />
            </div>
          </div>
          <div className="modal-backdrop bg-slate-900/40" onClick={() => setShowLowStockModal(false)}></div>
        </div>
      )}
    </div>
  );
}