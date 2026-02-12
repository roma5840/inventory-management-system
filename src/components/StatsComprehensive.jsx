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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop - Fixed to cover entire screen regardless of parent positioning */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowLowStockModal(false)} 
          />
          
          {/* Modal Container */}
          <div className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-xl text-slate-900">Critical Stock Report</h3>
                    </div>
                    <p className="text-sm text-slate-500 font-medium">Inventory items at or below minimum alert levels</p>
                </div>
                <button 
                    onClick={() => setShowLowStockModal(false)} 
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            {/* Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="table table-md w-full border-separate border-spacing-0">
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                            <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 pl-6">Barcode</th>
                            <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4">Product Name</th>
                            <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4">Location</th>
                            <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 text-center">Min</th>
                            <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 text-center">Current</th>
                            <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 text-center pr-6">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {modalLoading ? (
                            <tr>
                                <td colSpan="6" className="py-20">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <span className="loading loading-spinner loading-lg text-slate-300"></span>
                                    </div>
                                </td>
                            </tr>
                        ) : modalData.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-20 text-slate-400 font-medium">No critical items found.</td></tr>
                        ) : (
                            modalData.map(item => (
                                <tr key={item.internal_id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="pl-6 py-4">
                                        <code className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-600 group-hover:bg-white transition-colors uppercase tracking-tighter">
                                            {item.barcode}
                                        </code>
                                    </td>
                                    <td className="py-4">
                                        <div className="font-bold text-sm text-slate-800 leading-tight">{item.name}</div>
                                    </td>
                                    <td className="py-4">
                                        <span className="text-xs font-semibold text-slate-500">{item.location || '—'}</span>
                                    </td>
                                    <td className="py-4 text-center font-mono text-xs text-slate-400 font-bold">{item.min_stock_level}</td>
                                    <td className="py-4 text-center">
                                        <span className="text-sm font-black text-rose-600 tabular-nums">{item.current_stock}</span>
                                    </td>
                                    <td className="py-4 pr-6 text-center">
                                      {item.current_stock <= 0 ? (
                                          <span className="text-[10px] font-bold uppercase text-slate-300 tracking-tight">
                                              Out of Stock
                                          </span>
                                      ) : (
                                          <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-tight">
                                              Critical Level
                                          </span>
                                      )}
                                  </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer / Pagination */}
            <div className="bg-slate-50 border-t border-slate-100 p-4">
                <Pagination 
                    totalCount={lowStockCount}
                    itemsPerPage={LOW_STOCK_PER_PAGE}
                    currentPage={modalPage}
                    onPageChange={(p) => setModalPage(p)}
                    loading={modalLoading}
                />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}