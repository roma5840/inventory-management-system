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
                                <th className="text-right">Price Snapshot</th>
                                <th className="text-right">Cost Snapshot</th>
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

                                            {/* 4. Price Snapshot */}
                                            <td className="text-right font-mono align-top py-3 text-gray-600">
                                                {tx.price_snapshot !== null ? `₱${tx.price_snapshot.toLocaleString()}` : '-'}
                                            </td>

                                            {/* 5. Cost Snapshot */}
                                            <td className="text-right font-mono align-top py-3 text-orange-700">
                                                {tx.unit_cost_snapshot !== null ? `₱${tx.unit_cost_snapshot.toLocaleString()}` : '-'}
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