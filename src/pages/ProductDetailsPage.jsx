import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Navbar from "../components/Navbar";

export default function ProductDetailsPage() {
  const { id } = useParams(); // This maps to internal_id
  const navigate = useNavigate();
  
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPage, setJumpPage] = useState(1);
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
    const startIso = new Date(statsDateRange.start).toISOString();
    const endObj = new Date(statsDateRange.end);
    endObj.setHours(23, 59, 59, 999);
    const endIso = endObj.toISOString();

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
    fetchProductAudit();
  }, [id]);

  const fetchProductAudit = async () => {
    setLoading(true);
    try {
      // 1. Fetch Master Data
      const { data: prod, error: prodError } = await supabase
        .from('products')
        .select('*')
        .eq('internal_id', id)
        .single();

      if (prodError) throw prodError;
      setProduct(prod);

      // 2. Fetch Transaction History
      const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('product_internal_id', id)
        .order('timestamp', { ascending: false });

      if (txError) throw txError;

      // 3. Enrich with Staff Names
      const userIds = [...new Set(txs.map(t => t.user_id).filter(Boolean))];
      let userMap = {};
      
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('authorized_users')
          .select('auth_uid, full_name, email')
          .in('auth_uid', userIds);
        users?.forEach(u => userMap[u.auth_uid] = u.full_name || u.email);
      }

      // 4. Process Voids: Extract reasons from 'VOID' type rows to attach to the original
      const voidRows = txs.filter(t => t.type === 'VOID');
      const displayRows = txs.filter(t => t.type !== 'VOID');

      // Map void details by Reference Number
      const voidMap = {};
      voidRows.forEach(v => {
          voidMap[v.reference_number] = {
              reason: v.void_reason,
              who: userMap[v.user_id] || 'Unknown',
              when: v.timestamp
          };
      });

      const enriched = displayRows.map(t => ({
        ...t,
        staff_name: userMap[t.user_id] || 'Unknown',
        // Attach void metadata if this row is marked as voided
        void_details: t.is_voided ? voidMap[t.reference_number] : null
      }));

      setHistory(enriched);

    } catch (err) {
      console.error(err);
      alert("Error loading product details.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><span className="loading loading-spinner loading-lg"></span></div>;
  if (!product) return <div className="p-10 text-center">Product not found.</div>;

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4 mt-6">
        <button onClick={() => navigate(-1)} className="btn btn-sm btn-ghost gap-2 mb-4 text-gray-500">
            ← Back to Dashboard
        </button>

        {/* HEADER CARD: MASTER DATA */}
        <div className="card bg-white shadow-lg border-t-4 border-primary mb-8">
            <div className="card-body">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
                            {product.accpac_code && <span className="badge badge-primary badge-outline">{product.accpac_code}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 font-mono">
                            <span className="bg-gray-100 px-2 py-1 rounded">BARCODE: {product.barcode}</span>
                            <span>LOC: {product.location || "N/A"}</span>
                        </div>
                    </div>

                    <div className="stats shadow bg-slate-50 border border-slate-200">
                        <div className="stat place-items-center">
                            <div className="stat-title text-xs uppercase font-bold text-gray-400">Current Stock</div>
                            <div className={`stat-value text-2xl ${product.current_stock <= product.min_stock_level ? 'text-red-600' : 'text-gray-700'}`}>
                                {product.current_stock}
                            </div>
                        </div>
                        <div className="stat place-items-center">
                            <div className="stat-title text-xs uppercase font-bold text-gray-400">Unit Price</div>
                            <div className="stat-value text-xl text-primary">₱{product.price.toLocaleString()}</div>
                        </div>
                        <div className="stat place-items-center">
                            <div className="stat-title text-xs uppercase font-bold text-gray-400">Unit Cost</div>
                            <div className="stat-value text-xl text-orange-600">₱{product.unit_cost?.toLocaleString() || 0}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* PRODUCT PERFORMANCE STATS */}
        <div className="card bg-white shadow-lg mb-8 border border-gray-200">
            <div className="card-body p-6">
                
                {/* Header & Controls */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                        </svg>
                        Performance Metrics
                    </h3>
                    
                    <div className="flex items-center gap-3 bg-gray-50 p-2 px-3 rounded-lg border border-gray-100 shadow-sm">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Period:</span>
                        <input 
                            type="date" 
                            className="input input-xs input-ghost focus:bg-white text-gray-600 font-mono w-32"
                            value={statsDateRange.start}
                            onChange={(e) => setStatsDateRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                        <span className="text-gray-300">→</span>
                        <input 
                            type="date" 
                            className="input input-xs input-ghost focus:bg-white text-gray-600 font-mono w-32"
                            value={statsDateRange.end}
                            onChange={(e) => setStatsDateRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                        {statsLoading && <span className="loading loading-dots loading-xs text-primary ml-2"></span>}
                    </div>
                </div>

                <div className="space-y-6">
                    {/* 1. Financial KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Revenue */}
                        <div className="stat bg-white shadow-sm border border-gray-100 rounded-lg py-3" title="Total Revenue from Sales">
                            <div className="stat-title font-bold text-gray-400 uppercase text-[10px] tracking-wider">Total Sales</div>
                            <div className="stat-value text-primary text-2xl">₱{statsData.outflow.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            <div className="stat-desc text-[10px] text-gray-400 mt-1">Gross Revenue</div>
                        </div>

                        {/* COGS */}
                        <div className="stat bg-white shadow-sm border border-gray-100 rounded-lg py-3" title="Cost of Goods Sold">
                            <div className="stat-title font-bold text-gray-400 uppercase text-[10px] tracking-wider">Cost of Sales (COGS)</div>
                            <div className="stat-value text-gray-700 text-2xl">₱{statsData.outflow.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            <div className="stat-desc text-[10px] text-gray-400 mt-1">Based on historical unit cost</div>
                        </div>

                        {/* Profit */}
                        <div className="stat bg-white shadow-sm border border-gray-100 rounded-lg py-3" title="Revenue - COGS">
                            <div className="stat-title font-bold text-gray-400 uppercase text-[10px] tracking-wider">Est. Gross Profit</div>
                            <div className={`stat-value text-2xl ${(statsData.outflow.revenue - statsData.outflow.val) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ₱{(statsData.outflow.revenue - statsData.outflow.val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                            <div className="stat-desc text-[10px] text-gray-400 mt-1">Net Margin for Period</div>
                        </div>
                    </div>

                    {/* 2. Inventory Flow (4 Boxes) */}
                    <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Inventory Reconciliation Flow</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            
                            {/* Beginning */}
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm" title="Starting Stock">
                                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Beginning Inv</div>
                                <div className="text-xl font-bold text-gray-700">{statsData.beginning.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                                <div className="text-[10px] font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">
                                    Est: ₱{statsData.beginning.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            </div>

                            {/* Inflow */}
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm" title="Purchases / Receiving">
                                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Purchases (In)</div>
                                <div className="text-xl font-bold text-gray-700">{statsData.inflow.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                                <div className="text-[10px] font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">
                                    Cost: ₱{statsData.inflow.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            </div>

                            {/* Outflow */}
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm" title="Sales / Issuances / Voids">
                                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Sold/Out (Out)</div>
                                <div className="text-xl font-bold text-gray-700">{statsData.outflow.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                                <div className="text-[10px] font-mono mt-1 text-gray-500 border-t border-gray-100 pt-1">
                                    Cost: ₱{statsData.outflow.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            </div>

                            {/* Ending */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm" title="Final Stock for Period">
                                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 tracking-wider">Ending Inv</div>
                                <div className="text-xl font-bold text-gray-900">{statsData.ending.qty.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span></div>
                                <div className="text-[10px] font-mono mt-1 text-gray-600 border-t border-gray-200 pt-1">
                                    Val: ₱{statsData.ending.val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* AUDIT TRAIL TABLE */}
        <div className="card bg-white shadow-lg">
            <div className="card-body p-0">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-700">Audit Trail (Transaction History)</h2>
                    <span className="text-xs text-gray-500">Total Records: {history.length}</span>
                </div>

                <div className="overflow-x-auto min-h-[400px]">
                    <table className="table w-full text-sm">
                        <thead className="bg-gray-100 text-gray-600">
                            <tr>
                                <th>Date / Reference</th>
                                <th>Activity Type</th>
                                <th>Entity / Details</th>
                                <th className="text-right">Cost Snapshot</th>
                                <th className="text-right">Price Snapshot</th>
                                <th className="text-center">Qty Change</th>
                                <th className="text-center">Stock Balance</th>
                                <th className="text-right">Encoded By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr><td colSpan="8" className="text-center py-8 text-gray-400">No transactions found for this item.</td></tr>
                            ) : (
                                // PAGINATION SLICE LOGIC
                                history.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((tx) => {
                                    const isIncoming = tx.type === 'RECEIVING' || tx.type === 'ISSUANCE_RETURN';
                                    
                                    return (
                                        <tr key={tx.id} className={`hover transition-colors border-b border-gray-50 ${tx.is_voided ? 'bg-gray-50 opacity-60 grayscale' : ''}`}>
                                            
                                            {/* 1. Date & Ref */}
                                            <td className="align-top py-3">
                                                <div className="font-mono font-bold text-xs">{tx.reference_number}</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {new Date(tx.timestamp).toLocaleDateString()}
                                                </div>
                                                <div className="text-[10px] text-gray-400">
                                                    {new Date(tx.timestamp).toLocaleTimeString()}
                                                </div>
                                                {tx.is_voided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                                            </td>

                                            {/* 2. Type */}
                                            <td className="align-top py-3">
                                                <div className={`badge badge-sm border-0 font-bold 
                                                    ${tx.type === 'RECEIVING' ? 'bg-green-100 text-green-800' : 
                                                      tx.type === 'ISSUANCE' ? 'bg-blue-100 text-blue-800' : 
                                                      tx.type === 'ISSUANCE_RETURN' ? 'bg-indigo-100 text-indigo-800' :
                                                      tx.type === 'PULL_OUT' ? 'bg-orange-100 text-orange-800' : 
                                                      'bg-gray-100 text-gray-800'}`}>
                                                    {tx.type.replace('_', ' ')}
                                                </div>
                                                {tx.transaction_mode && (
                                                    <div className="text-[10px] mt-1 font-semibold text-gray-400 uppercase">
                                                        {tx.transaction_mode}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 3. Entity (Student/Supplier) */}
                                            <td className="align-top py-3">
                                                {tx.student_name ? (
                                                    <div>
                                                        <div className="font-bold text-xs text-gray-700">{tx.student_name}</div>
                                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                                            {tx.student_id && <span className="font-mono text-gray-400 mr-1">{tx.student_id} •</span>}
                                                            {tx.course} {tx.year_level}
                                                        </div>
                                                    </div>
                                                ) : tx.supplier ? (
                                                    <div>
                                                        <span className="text-[9px] text-gray-400 uppercase">Supplier:</span>
                                                        <div className="font-bold text-gray-700 text-xs">{tx.supplier}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic text-xs">N/A</span>
                                                )}
                                                {tx.remarks && (
                                                    <div className="mt-2 text-[10px] text-orange-600 bg-orange-50 inline-block px-1.5 py-0.5 rounded border border-orange-100">
                                                        Note: {tx.remarks}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 4. Cost Snapshot */}
                                            <td className="text-right font-mono align-top py-3 text-orange-700">
                                                {tx.unit_cost_snapshot !== null ? `₱${tx.unit_cost_snapshot.toLocaleString()}` : '-'}
                                            </td>

                                            {/* 5. Price Snapshot */}
                                            <td className="text-right font-mono align-top py-3 text-gray-600">
                                                {tx.price_snapshot !== null ? `₱${tx.price_snapshot.toLocaleString()}` : '-'}
                                            </td>

                                            {/* 6. Qty Change */}
                                            <td className="text-center align-top py-3">
                                                <span className={`font-bold text-lg ${isIncoming ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isIncoming ? '+' : '-'}{tx.qty}
                                                </span>
                                            </td>

                                            {/* 7. Stock Balance Snapshot */}
                                            <td className="text-center align-top py-3">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-bold text-gray-700">{tx.new_stock}</span>
                                                    <span className="text-[9px] text-gray-400">prev: {tx.previous_stock}</span>
                                                </div>
                                            </td>

                                            {/* 8. Staff & Void Details */}
                                            <td className="text-right align-top py-3">
                                                <div className="text-xs font-semibold text-gray-600">{tx.staff_name}</div>
                                                
                                                {tx.is_voided && tx.void_details && (
                                                    <div className="mt-2 pt-1 border-t border-red-200 flex flex-col items-end">
                                                        <span className="text-[9px] text-red-500 font-bold uppercase tracking-wider">Voided By</span>
                                                        <div className="text-[10px] text-red-700 font-medium">
                                                            {tx.void_details.who}
                                                        </div>
                                                        <div className="text-[9px] text-red-400 flex flex-col items-end">
                                                            <span>{new Date(tx.void_details.when).toLocaleDateString()}</span>
                                                            <span>{new Date(tx.void_details.when).toLocaleTimeString()}</span>
                                                        </div>
                                                        <div className="text-[9px] text-red-600 italic mt-0.5 max-w-[120px] text-right">
                                                            "{tx.void_details.reason}"
                                                        </div>
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
                 {/* PAGINATION FOOTER */}
                <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t bg-gray-50 gap-4 rounded-b-lg">
                    <div className="text-xs text-gray-500">
                        {history.length > 0 
                        ? `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1} - ${Math.min(currentPage * ITEMS_PER_PAGE, history.length)} of ${history.length} records`
                        : "No records found"}
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            className="btn btn-sm btn-outline bg-white hover:bg-gray-100"
                            disabled={currentPage === 1}
                            onClick={() => {
                                setCurrentPage(p => p - 1);
                                setJumpPage(p => p - 1);
                            }}
                        >
                            « Prev
                        </button>
                        
                        <div className="flex items-center gap-1 mx-2">
                            <input 
                                type="number" 
                                min="1" 
                                max={Math.ceil(history.length / ITEMS_PER_PAGE) || 1}
                                value={jumpPage}
                                onChange={(e) => setJumpPage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        let p = parseInt(jumpPage);
                                        const max = Math.ceil(history.length / ITEMS_PER_PAGE) || 1;
                                        if (p > 0 && p <= max) {
                                            setCurrentPage(p);
                                        }
                                    }
                                }}
                                className="input input-sm input-bordered w-16 text-center"
                            />
                            <span className="text-sm">of {Math.ceil(history.length / ITEMS_PER_PAGE) || 1}</span>
                        </div>

                        <button 
                            className="btn btn-sm btn-outline bg-white hover:bg-gray-100"
                            disabled={currentPage >= Math.ceil(history.length / ITEMS_PER_PAGE)}
                            onClick={() => {
                                setCurrentPage(p => p + 1);
                                setJumpPage(p => p + 1);
                            }}
                        >
                            Next »
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}