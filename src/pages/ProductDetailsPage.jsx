import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";

export default function ProductDetailsPage() {
  // --- CONFIG: TEMPORARILY SET TO FALSE TO HIDE PROFIT/MARGIN ---
  const SHOW_PROFIT_MARGIN = false; 

  const { id } = useParams(); // This maps to internal_id
  const navigate = useNavigate();
  const { userRole } = useAuth();
  
  // Ref to ensure alert only fires once per mount
  const alertShown = useRef(false);

  // Security: Redirect Employees immediately
  useEffect(() => {
    if (userRole === 'EMPLOYEE' && !alertShown.current) {
      alertShown.current = true; // Mark as shown immediately
      alert("Access Denied: You do not have permission to view Product Audit Trails.");
      navigate("/", { replace: true });
    }
  }, [userRole, navigate]);

  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false); // For History/Table
  const [totalCount, setTotalCount] = useState(0);


  // Stop rendering immediately to prevent content flash or further errors
  if (userRole === 'EMPLOYEE') return null;

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [statsDateRange, setStatsDateRange] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return {
      start: `${yyyy}-${mm}-01`,
      end: `${yyyy}-${mm}-${dd}`
    };
  });
  
  const [statsData, setStatsData] = useState({
    beginning: { qty: 0, val: 0 },
    inflow: { qty: 0, val: 0 },
    outflow: { qty: 0, val: 0, revenue: 0 },
    ending: { qty: 0, val: 0 }
  });
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (id) fetchProductStats();
  }, [id, statsDateRange]);

  const fetchProductStats = async () => {
    setStatsLoading(true);
    const startIso = new Date(`${statsDateRange.start}T00:00:00`).toISOString();
    const endIso = new Date(`${statsDateRange.end}T23:59:59.999`).toISOString();

    const { data: s, error } = await supabase.rpc('get_product_period_stats', {
      target_id: id,
      start_date: startIso,
      end_date: endIso
    });

    if (!error && s) {
      // Calculate derived stats
      const endQty = Number(s.current_qty) || 0;
      const endVal = Number(s.current_val) || 0;
      const inQty = Number(s.inflow_qty) || 0;
      const inCost = Number(s.inflow_cost) || 0;
      const outQty = Number(s.outflow_qty) || 0;
      const rev = Number(s.sales_revenue) || 0;
      const cogs = Number(s.cogs) || 0;

      // Reverse engineering Beginning
      const begQty = endQty - inQty + outQty;
      const begVal = endVal - inCost + cogs;

      setStatsData({
        beginning: { qty: begQty, val: begVal },
        inflow: { qty: inQty, val: inCost },
        outflow: { qty: outQty, val: cogs, revenue: rev },
        ending: { qty: endQty, val: endVal }
      });
    }
    setStatsLoading(false);
  };

  useEffect(() => {
    if (id) {
      fetchMasterData();
      fetchHistory(); // Initial fetch
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchHistory();
  }, [currentPage]);

  const fetchMasterData = async () => {
    setLoading(true);
    try {
      const { data: prod, error: prodError } = await supabase
        .from('products')
        .select('*')
        .eq('internal_id', id)
        .single();

      if (prodError) throw prodError;
      setProduct(prod);
    } catch (err) {
      console.error(err);
      alert("Error loading product details.");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setTableLoading(true);
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // 1. Query the VIEW instead of the base table
      let query = supabase
        .from('vw_transaction_history')
        .select('*', { count: 'exact' })
        .eq('product_internal_id', id)
        .order('timestamp', { ascending: false })
        .range(from, to);

      const { data: txs, count, error: txError } = await query;
      if (txError) throw txError;

      let combinedData = [...(txs || [])];

      // 2. Fetch void details (Who voided it) for rows that are marked as voided.
      // We still need this because the VOID row might be on a different pagination page.
      const voidedRefs = combinedData.filter(t => t.is_voided).map(t => t.reference_number);
      let voidDetailMap = {};

      if (voidedRefs.length > 0) {
        // Query the VIEW again just for the specific VOID rows
        const { data: vRows } = await supabase
          .from('vw_transaction_history')
          .select('reference_number, staff_name, timestamp, void_reason')
          .eq('type', 'VOID')
          .in('reference_number', voidedRefs);

        vRows?.forEach(v => {
          voidDetailMap[v.reference_number] = {
            reason: v.void_reason,
            who: v.staff_name, // natively from view
            when: v.timestamp
          };
        });
      }

      // 3. Enrich the main data
      // The View already provided staff_name and original_bis natively!
      const enriched = combinedData.map(t => ({
        ...t,
        void_details: t.is_voided ? voidDetailMap[t.reference_number] : null,
        // If it's a VOID row, the view automatically maps original_bis to the original transaction's BIS
        display_bis: t.type === 'VOID' ? (t.original_bis || t.bis_number) : t.bis_number
      }));

      setHistory(enriched);
      setTotalCount(count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setTableLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><span className="loading loading-spinner loading-lg"></span></div>;
  if (!product) return <div className="p-10 text-center">Product not found.</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            <div>
                <button onClick={() => navigate(-1)} className="btn btn-sm btn-ghost gap-2 mb-4 text-slate-500 hover:bg-slate-200">
                    ← Back to Inventory
                </button>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Product Audit Trail</h1>
                <p className="text-sm text-slate-500">Detailed historical movements and performance for this item.</p>
            </div>

            {/* HEADER CARD: MASTER DATA */}
            <div className="card bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                <div className="card-body p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                        {/* Text Container: min-w-0 + flex-1 prevents pushing the stats card out of view */}
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                {/* break-all ensures even long single-word strings wrap instead of overflowing */}
                                <h2 className="text-2xl font-bold text-slate-800 leading-tight break-all">
                                    {product.name}
                                </h2>
                                {product.accpac_code && <span className="badge badge-primary badge-outline flex-shrink-0">{product.accpac_code}</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-slate-500 font-mono">
                                <span className="bg-slate-100 px-2 py-1 rounded break-all">
                                    BARCODE: {product.barcode}
                                </span>
                                <span className="break-all">
                                    LOC: {product.location || "N/A"}
                                </span>
                            </div>
                        </div>

                        {/* Stats Container: flex-shrink-0 prevents this block from narrowing or disappearing */}
                        <div className="stats shadow-none bg-slate-50 border border-slate-200 rounded-xl flex-shrink-0">
                            <div className="stat place-items-center">
                                <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Current Stock</div>
                                <div className={`stat-value text-2xl ${product.current_stock <= product.min_stock_level ? 'text-rose-600' : 'text-slate-700'}`}>
                                    {product.current_stock}
                                </div>
                            </div>
                            <div className="stat place-items-center">
                                <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Unit Cost</div>
                                <div className="stat-value text-xl text-slate-500">₱{product.unit_cost?.toLocaleString() || 0}</div>
                            </div>
                            <div className="stat place-items-center">
                                <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Unit Cash Price</div>
                                <div className="stat-value text-xl text-slate-600 font-bold">₱{product.cash_price?.toLocaleString() || 0}</div>
                            </div>
                            <div className="stat place-items-center">
                                <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Unit Price</div>
                                <div className="stat-value text-xl text-slate-700 font-bold">₱{product.price?.toLocaleString() || 0}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        {/* PRODUCT PERFORMANCE STATS */}
        <div className="space-y-6 mb-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Performance Metrics</h3>
                    <p className="text-xs text-slate-500 font-medium">Reconciliation flow for the selected period</p>
                </div>
                
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5 px-3 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period:</span>
                    <input 
                        type="date" 
                        className="bg-transparent text-xs font-bold text-slate-600 outline-none border-none p-0 w-28"
                        value={statsDateRange.start}
                        onChange={(e) => setStatsDateRange(prev => ({ ...prev, start: e.target.value }))}
                    />
                    <span className="text-slate-300 mx-1">—</span>
                    <input 
                        type="date" 
                        className="bg-transparent text-xs font-bold text-slate-600 outline-none border-none p-0 w-28"
                        value={statsDateRange.end}
                        onChange={(e) => setStatsDateRange(prev => ({ ...prev, end: e.target.value }))}
                    />
                    {statsLoading && <span className="loading loading-dots loading-xs text-primary ml-2"></span>}
                </div>
            </div>

            {/* Reconciliation Grid */}
            <div className="flex flex-col md:flex-row items-center gap-2">
                {[
                    { label: "Beginning Inv", qty: statsData.beginning.qty, val: statsData.beginning.val },
                    { label: "Total Inflow", qty: statsData.inflow.qty, val: statsData.inflow.val },
                    { label: "Net Outflow", qty: statsData.outflow.qty, val: statsData.outflow.val },
                    { label: "Ending Inv", qty: statsData.ending.qty, val: statsData.ending.val, active: true },
                ].map((box, i, arr) => (
                    <>
                        <div key={`box-${i}`} className={`flex-1 w-full p-5 rounded-xl border ${box.active ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-800 shadow-sm hover:border-slate-300'} transition-all`}>
                            <div className={`text-[10px] font-black uppercase tracking-widest mb-3 ${box.active ? 'text-slate-400' : 'text-slate-400'}`}>
                                {box.label}
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-3xl font-bold tracking-tighter font-mono ${!box.active ? 'text-slate-800' : ''}`}>{box.qty.toLocaleString()}</span>
                                <span className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Units</span>
                            </div>
                            {SHOW_PROFIT_MARGIN && (
                                <div className={`mt-4 pt-3 border-t font-mono text-xs ${box.active ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
                                    ₱ {box.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            )}
                        </div>
                        {i < arr.length - 1 && (
                            <div key={`arrow-${i}`} className="text-slate-300 hidden md:block shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                            </div>
                        )}
                    </>
                ))}
            </div>

            {/* Financial Performance (Only if Margin is ON) */}
            {SHOW_PROFIT_MARGIN && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Sales Revenue</div>
                        <div className="text-xl font-bold text-indigo-600 font-mono">₱{statsData.outflow.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost of Goods Sold</div>
                        <div className="text-xl font-bold text-slate-700 font-mono">₱{statsData.outflow.val.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Est. Gross Profit</div>
                        <div className={`text-xl font-bold font-mono ${(statsData.outflow.revenue - statsData.outflow.val) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            ₱{(statsData.outflow.revenue - statsData.outflow.val).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* AUDIT TRAIL TABLE */}
        <div className="card bg-white shadow-xl border border-slate-200 overflow-hidden rounded-2xl">
             <div className="card-body p-0">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Audit Trail</h2>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Historical transaction logs for this item</p>
                    </div>
                </div>
                <div className="overflow-x-auto min-h-[450px]">
                    <table className="table w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50/90 backdrop-blur-sm text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-200">
                                <th className="py-4 pl-6 w-[15%]">Date / Ref</th>
                                <th className="py-4 w-[15%]">BIS / Type</th>
                                <th className="py-4 w-[20%]">Entity / Details</th>
                                <th className="py-4 text-right w-[15%]">Unit Value Ref</th>
                                <th className="py-4 text-center w-[10%]">Change</th>
                                <th className="py-4 text-center w-[10%]">Balance</th>
                                <th className="py-4 pr-6 text-right w-[15%]">Encoder</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tableLoading ? (
                                <tr><td colSpan="7" className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan="7" className="text-center py-16 text-slate-400 font-medium uppercase tracking-widest text-xs">No transactions found for this item.</td></tr>
                            ) : (
                                history.map((tx) => {
                                    const isIncoming = (tx.new_stock > tx.previous_stock);
                                    const isVoidRow = tx.type === 'VOID';
                                    
                                    return (
                                        <tr key={tx.id} className={`hover:bg-slate-50/70 transition-colors group 
                                            ${tx.is_voided && !isVoidRow ? 'opacity-50 grayscale bg-slate-50/50' : ''} 
                                            ${isVoidRow ? 'bg-amber-50/40 hover:bg-amber-50/60' : ''}`}>
                                            
                                            {/* 1. Date & Ref */}
                                            <td className="py-4 pl-6 align-top">
                                                <div className="text-xs font-semibold text-slate-800">
                                                    {new Date(tx.timestamp).toLocaleDateString()}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 mb-1.5">
                                                    {new Date(tx.timestamp).toLocaleTimeString()}
                                                </div>
                                                <div className={`font-mono text-[9px] font-bold text-slate-400 select-all break-all uppercase`}>
                                                    {tx.reference_number}
                                                </div>
                                                {tx.is_voided && !isVoidRow && <span className="badge badge-error badge-xs font-bold text-[8px] uppercase tracking-widest mt-1 border-none">VOIDED</span>}
                                            </td>

                                            {/* 2. BIS & Type */}
                                            <td className="py-4 align-top">
                                                <div className={`font-mono text-lg font-bold tracking-tight leading-none ${tx.is_voided && !isVoidRow ? 'text-red-900 line-through decoration-red-300' : 'text-slate-800'}`}>
                                                    #{tx.display_bis || "---"}
                                                </div>
                                                <div className={`mt-2 inline-block px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest leading-none
                                                    ${isVoidRow ? 'bg-amber-600 text-white' : 
                                                    tx.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-800' : 
                                                    tx.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-800' : 
                                                    tx.type === 'ISSUANCE_RETURN' ? 'bg-sky-100 text-sky-800' :
                                                    tx.type === 'PULL_OUT' ? 'bg-amber-100 text-amber-800' :
                                                    'bg-slate-100 text-slate-800'}`}>
                                                    {isVoidRow ? 'REVERSAL' : tx.type.replace('_', ' ')}
                                                </div>
                                                {tx.transaction_mode && !isVoidRow && (
                                                    <div className="text-[9px] mt-1.5 font-black text-slate-400 uppercase tracking-widest pl-1">
                                                        {tx.transaction_mode}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 3. Entity / Details */}
                                            <td className="py-4 align-top pr-4">
                                                <div className="max-w-xs break-words whitespace-normal space-y-1">
                                                    {isVoidRow ? (
                                                        <div>
                                                            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-widest block mb-0.5">Void Reason</span>
                                                            <div className="text-xs italic font-medium text-slate-700 leading-snug">"{tx.void_reason}"</div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {tx.transaction_mode === 'TRANSMITTAL' ? (
                                                                <div>
                                                                    <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest block mb-0.5">Dept Transmittal</span>
                                                                    <div className="font-bold text-xs text-slate-800 leading-snug mb-1">{tx.department}</div>
                                                                    {tx.transmittal_no && (
                                                                        <div className="text-[10px] font-mono text-indigo-500 font-semibold mb-1.5">
                                                                            TR #: {tx.transmittal_no}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-[10px] text-slate-600 space-y-0.5 leading-tight">
                                                                        {tx.requested_by && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mr-1">Req</span> {tx.requested_by}</div>}
                                                                        {tx.released_by && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mr-1">Rel</span> {tx.released_by}</div>}
                                                                        {tx.charge_to && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mr-1">Chg</span> {tx.charge_to}</div>}
                                                                        {tx.purpose && <div className="italic text-slate-500 mt-1">"{tx.purpose}"</div>}
                                                                    </div>
                                                                </div>
                                                            ) : tx.student_name ? (
                                                                <div>
                                                                    <div className="font-semibold text-xs text-slate-800 leading-snug mb-0.5">
                                                                        {tx.student_name}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 font-medium leading-tight">
                                                                        {tx.student_id && <span className="font-mono mr-1">{tx.student_id} •</span>}
                                                                        {tx.course} {tx.year_level}
                                                                    </div>
                                                                </div>
                                                            ) : tx.supplier ? (
                                                                <div>
                                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Supplier</span>
                                                                    <div className="font-semibold text-slate-800 text-xs leading-snug">
                                                                        {tx.supplier}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 italic text-[10px] font-medium">No Entity Context</span>
                                                            )}

                                                            {/* Released By */}
                                                            {tx.released_by && tx.transaction_mode !== 'TRANSMITTAL' && (
                                                                <div className="text-[10px] text-slate-500 leading-tight mt-1">
                                                                    <span className="font-bold text-slate-400 uppercase tracking-widest">Rel:</span> {tx.released_by}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* LINKED BIS # (For Returns) */}
                                                    {tx.type === 'ISSUANCE_RETURN' && tx.original_bis && (
                                                        <div className="mt-2 text-[10px] text-sky-700 font-bold uppercase tracking-widest">
                                                            Issuance Link: <span className="font-mono text-sky-600">#{tx.original_bis}</span>
                                                        </div>
                                                    )}

                                                    {tx.remarks && !isVoidRow && (
                                                        <div className="mt-2 text-[10px] text-amber-700 font-medium leading-snug bg-amber-50/80 p-1.5 rounded-md border border-amber-200">
                                                            <span className="font-bold uppercase tracking-widest text-[9px] mr-1 block mb-0.5">Note</span> {tx.remarks}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 4. Value Snapshot */}
                                            <td className="py-4 align-top text-right">
                                                <div className="space-y-1 inline-flex flex-col">
                                                    <div className="flex justify-between gap-3 text-xs">
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Cost</span>
                                                        <span className="font-mono text-slate-600">{tx.unit_cost_snapshot !== null ? `₱${tx.unit_cost_snapshot.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '—'}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-3 text-xs">
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Cash</span>
                                                        <span className="font-mono text-slate-700 font-semibold">{tx.cash_price_snapshot !== null ? `₱${tx.cash_price_snapshot.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '—'}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-3 text-xs pt-1 border-t border-slate-100">
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">SRP</span>
                                                        <span className="font-mono text-slate-800 font-bold">{tx.price_snapshot !== null ? `₱${tx.price_snapshot.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '—'}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 5. Qty Change */}
                                            <td className="py-4 align-middle text-center">
                                                <span className={`font-mono text-xl font-bold tracking-tighter ${isIncoming ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isIncoming ? '+' : '-'}{tx.qty}
                                                </span>
                                            </td>

                                            {/* 6. Balance */}
                                            <td className="py-4 align-middle text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-mono text-lg font-bold text-slate-800 leading-none">{tx.new_stock}</span>
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Prev: {tx.previous_stock}</span>
                                                </div>
                                            </td>

                                            {/* 7. Encoder */}
                                            <td className="py-4 pr-6 align-top text-right">
                                                <div className="text-xs font-bold text-slate-700">{tx.staff_name}</div>
                                                {!isVoidRow && tx.is_voided && tx.void_details && (
                                                    <div className="mt-2 text-[9px] text-red-600 font-bold uppercase tracking-widest leading-tight">
                                                        <span className="block mb-0.5 text-red-400">Reversed By</span>
                                                        {tx.void_details.who}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                 
                 {/* Pagination Controls */}
                 <div className="p-4 border-t border-slate-200">
                    <Pagination 
                        totalCount={totalCount}
                        itemsPerPage={ITEMS_PER_PAGE}
                        currentPage={currentPage}
                        onPageChange={(p) => setCurrentPage(p)}
                        loading={tableLoading} 
                    />
                 </div>
             </div>
         </div>
       </div>
      </main>
    </div>
  );
}