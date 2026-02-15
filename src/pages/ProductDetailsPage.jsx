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

  const [statsDateRange, setStatsDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
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

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('product_internal_id', id)
        .order('timestamp', { ascending: false })
        .range(from, to);

      const { data: txs, count, error: txError } = await query;
      if (txError) throw txError;

      let combinedData = [...(txs || [])];

      // 1. Fetch void details and cross-reference BIS numbers for VOID rows
      const voidedRefs = combinedData.filter(t => t.is_voided || t.type === 'VOID').map(t => t.reference_number);
      const originIds = [...new Set(combinedData.map(t => t.original_transaction_id).filter(Boolean))];

      let voidRows = [];
      let voidRefToBisMap = {};

      if (voidedRefs.length > 0) {
        const { data: vRows } = await supabase
          .from('transactions')
          .select('*')
          .eq('type', 'VOID')
          .in('reference_number', voidedRefs);
        voidRows = vRows || [];

        // Also fetch the original BIS numbers for the VOID entries to display in the BIS column
        const { data: originals } = await supabase
          .from('transactions')
          .select('reference_number, bis_number')
          .in('reference_number', voidedRefs)
          .neq('type', 'VOID');
        
        originals?.forEach(o => {
          voidRefToBisMap[o.reference_number] = o.bis_number;
        });
      }

      // 2. Fetch Original BIS Numbers for Returns
      let originMap = {};
      if (originIds.length > 0) {
        const { data: origins } = await supabase
          .from('transactions')
          .select('id, bis_number')
          .in('id', originIds);
        origins?.forEach(o => { originMap[o.id] = o.bis_number; });
      }

      // 3. Collect ALL unique User IDs for Staff mapping
      const allUserIds = new Set([
        ...combinedData.map(t => t.user_id),
        ...voidRows.map(v => v.user_id)
      ].filter(Boolean));

      let userMap = {};
      if (allUserIds.size > 0) {
        const { data: users } = await supabase
          .from('authorized_users')
          .select('auth_uid, full_name, email')
          .in('auth_uid', Array.from(allUserIds));
        users?.forEach(u => userMap[u.auth_uid] = u.full_name || u.email);
      }

      // 4. Map Void details (Who voided it and why)
      let voidDetailMap = {};
      voidRows.forEach(v => {
        voidDetailMap[v.reference_number] = {
          reason: v.void_reason,
          who: userMap[v.user_id] || 'Unknown Staff',
          when: v.timestamp
        };
      });

      // 5. Enrich the main data
      const enriched = combinedData.map(t => ({
        ...t,
        staff_name: userMap[t.user_id] || 'Unknown',
        void_details: t.is_voided ? voidDetailMap[t.reference_number] : null,
        original_bis: originMap[t.original_transaction_id] || null,
        // If it's a VOID row, use the resolved original BIS number
        display_bis: t.type === 'VOID' ? (voidRefToBisMap[t.reference_number] || t.bis_number) : t.bis_number
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
                                <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Unit Price</div>
                                <div className="stat-value text-xl text-slate-700 font-bold">₱{product.price.toLocaleString()}</div>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: "Beginning Inv", qty: statsData.beginning.qty, val: statsData.beginning.val },
                    { label: "Total Inflow", qty: statsData.inflow.qty, val: statsData.inflow.val },
                    { label: "Net Outflow", qty: statsData.outflow.qty, val: statsData.outflow.val },
                    { label: "Ending Inv", qty: statsData.ending.qty, val: statsData.ending.val, active: true },
                ].map((box, i) => (
                    <div key={i} className={`p-5 rounded-xl border ${box.active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-800 shadow-sm hover:border-slate-300'} transition-all`}>
                        <div className={`text-[10px] font-black uppercase tracking-widest mb-3 ${box.active ? 'text-slate-400' : 'text-slate-400'}`}>
                            {box.label}
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-3xl font-bold tracking-tighter ${!box.active ? 'text-slate-800' : ''}`}>{box.qty.toLocaleString()}</span>
                            <span className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Units</span>
                        </div>
                        {SHOW_PROFIT_MARGIN && (
                            <div className={`mt-4 pt-3 border-t font-mono text-xs ${box.active ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
                                ₱ {box.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                        )}
                    </div>
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
        <div className="card bg-white shadow-xl border border-slate-200 overflow-hidden">
             <div className="card-body p-0">
                <div className="p-5 border-b flex justify-between items-center bg-white">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Audit Trail</h2>
                        <p className="text-xs text-slate-500 font-medium">Historical transaction logs for this item</p>
                    </div>
                </div>
                <div className="overflow-x-auto min-h-[450px]">
                    <table className="table w-full">
                        <thead>
                            <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                                <th className="bg-slate-50/80">Date / Reference</th>
                                <th className="bg-slate-50/80">BIS #</th>
                                <th className="bg-slate-50/80">Activity Type</th>
                                <th className="bg-slate-50/80">Entity / Details</th>
                                <th className="text-right bg-slate-50/80">Cost</th>
                                <th className="text-right bg-slate-50/80">Price</th>
                                <th className="text-center bg-slate-50/80">Qty Change</th>
                                <th className="text-center bg-slate-50/80">Balance</th>
                                <th className="text-right bg-slate-50/80">Encoder</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tableLoading ? (
                                <tr><td colSpan="9" className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan="9" className="text-center py-12 text-slate-400 font-medium">No transactions found for this item.</td></tr>
                            ) : (
                                history.map((tx) => {
                                    const isIncoming = (tx.new_stock > tx.previous_stock);
                                    const isVoidRow = tx.type === 'VOID';
                                    
                                    return (
                                        <tr key={tx.id} className={`hover:bg-slate-50/50 transition-colors group 
                                            ${tx.is_voided ? 'opacity-50 grayscale italic bg-slate-50' : ''} 
                                            ${isVoidRow ? 'bg-amber-50/30' : ''}`}>
                                            
                                            {/* 1. Date & Ref */}
                                            <td className="py-4">
                                                <div className={`font-mono text-[10px] text-slate-400 select-all break-all max-w-[100px]`}>
                                                    {tx.reference_number}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                                                    {new Date(tx.timestamp).toLocaleDateString()} • {new Date(tx.timestamp).toLocaleTimeString()}
                                                </div>
                                                {tx.is_voided && <span className="badge badge-error badge-xs font-bold text-[8px] mt-1">VOIDED</span>}
                                                {isVoidRow && <span className="badge badge-warning badge-xs font-bold text-[8px] mt-1">REVERSAL</span>}
                                            </td>

                                            {/* 2. BIS # */}
                                            <td>
                                                <div className="font-black text-lg text-slate-700 leading-none">
                                                    #{tx.display_bis || "---"}
                                                </div>
                                            </td>

                                            {/* 3. Type */}
                                            <td>
                                                <div className={`badge badge-sm border-0 font-bold text-[10px] px-2
                                                    ${isVoidRow ? 'bg-amber-600 text-white' : 
                                                    tx.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-800' : 
                                                    tx.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-800' : 
                                                    tx.type === 'ISSUANCE_RETURN' ? 'bg-sky-100 text-sky-800' :
                                                    'bg-slate-100 text-slate-800'}`}>
                                                    {tx.type.replace('_', ' ')}
                                                </div>
                                                {tx.transaction_mode && !isVoidRow && (
                                                    <div className="text-[9px] mt-1 font-black text-slate-400 uppercase tracking-tighter">
                                                        {tx.transaction_mode}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 4. Entity / Details */}
                                            <td className="py-4 align-top">
                                                <div className="max-w-xs break-words whitespace-normal space-y-1">
                                                    {isVoidRow ? (
                                                        <div>
                                                            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-widest block">Void Reason</span>
                                                            <div className="text-xs italic text-slate-600 leading-snug">"{tx.void_reason}"</div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {tx.student_name ? (
                                                                <div>
                                                                    <div className="font-bold text-xs text-slate-700 leading-snug mb-0.5">
                                                                        {tx.student_name}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-400 leading-tight">
                                                                        {tx.student_id && <span className="font-mono mr-1">{tx.student_id} •</span>}
                                                                        {tx.course} {tx.year_level}
                                                                    </div>
                                                                </div>
                                                            ) : tx.supplier ? (
                                                                <div>
                                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Supplier</span>
                                                                    <div className="font-bold text-slate-700 text-xs leading-snug">
                                                                        {tx.supplier}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-300 italic text-[10px]">N/A</span>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* LINKED BIS # (For Returns) - Styled to match TransactionHistory */}
                                                    {tx.type === 'ISSUANCE_RETURN' && tx.original_bis && (
                                                        <div className="mt-2 flex items-center gap-1.5">
                                                            <div className="p-1 bg-sky-50 rounded text-sky-600">
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                    <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h9.128c1.81 0 3.5.908 4.5 2.424a5.25 5.25 0 01-4.5 8.076h-1.5a.75.75 0 010-1.5h1.5a3.75 3.75 0 003.214-5.771 3.75 3.75 0 00-3.214-1.729H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.25-5a.75.75 0 010-1.085l5.25-5a.75.75 0 011.06.025z" clipRule="evenodd" />
                                                                </svg>
                                                            </div>
                                                            <div className="text-[10px] font-medium text-sky-700">
                                                                Issuance Link: <span className="font-black text-xs">#{tx.original_bis}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {tx.remarks && !isVoidRow && (
                                                        <div className="text-[10px] text-amber-600 font-medium leading-snug">
                                                            Note: {tx.remarks}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 5. Cost */}
                                            <td className="text-right font-mono text-xs text-slate-500">
                                                {tx.unit_cost_snapshot !== null ? `₱${tx.unit_cost_snapshot.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '—'}
                                            </td>

                                            {/* 6. Price */}
                                            <td className="text-right font-mono text-xs font-semibold text-slate-700">
                                                {tx.price_snapshot !== null ? `₱${tx.price_snapshot.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '—'}
                                            </td>

                                            {/* 7. Qty Change */}
                                            <td className="text-center">
                                                <span className={`font-black text-base tracking-tighter ${isIncoming ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isIncoming ? '+' : '-'}{tx.qty}
                                                </span>
                                            </td>

                                            {/* 8. Balance */}
                                            <td className="text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-bold text-slate-700 text-sm">{tx.new_stock}</span>
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Prev: {tx.previous_stock}</span>
                                                </div>
                                            </td>

                                            {/* 9. Encoder */}
                                            <td className="text-right">
                                                <div className="text-[11px] font-bold text-slate-600">{tx.staff_name}</div>
                                                {!isVoidRow && tx.is_voided && tx.void_details && (
                                                    <div className="mt-1 text-[9px] text-rose-500 font-medium">
                                                        Voided by {tx.void_details.who}
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
      </main>
    </div>
  );
}