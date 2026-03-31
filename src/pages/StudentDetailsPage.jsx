import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Pagination from "../components/Pagination";

export default function StudentDetailsPage() {
  const { id } = useParams(); // target student_id
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [student, setStudent] = useState(null);
  const [stats, setStats] = useState({ issued_items: 0, returned_items: 0, net_items: 0, total_value: 0 });
  const [transactions, setTransactions] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    if (id) {
      fetchMasterData();
      fetchTransactions();
    }
  }, [id, currentPage, userRole]);

  const fetchMasterData = async () => {
    try {
      const { data: stu, error: stuError } = await supabase.from('students').select('*').eq('student_id', id).single();
      if (stuError) throw stuError;
      setStudent(stu);

      // Only fetch stats if user has permission
      if (['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
          const { data: st, error: stError } = await supabase.rpc('get_student_period_stats', { target_student_id: id });
          if (!stError && st) setStats(st);
      }
    } catch (err) {
      console.error(err);
      alert("Error loading student details.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setTableLoading(true);
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: headerData, count, error: headerError } = await supabase
        .from('vw_transaction_headers')
        .select('*', { count: 'exact' })
        .eq('student_id', id)
        .order('timestamp', { ascending: false })
        .range(from, to);
      
      if (headerError) throw headerError;
      setTotalCount(count || 0);

      if (!headerData || headerData.length === 0) {
          setTransactions([]);
          return;
      }

      const pageRefs = headerData.map(h => h.reference_number);
      const { data: txData, error: txError } = await supabase
          .from('vw_transaction_history')
          .select('*')
          .in('reference_number', pageRefs)
          .order('timestamp', { ascending: false });

      if (txError) throw txError;
      setTransactions(txData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTableLoading(false);
    }
  };

  const toggleRow = (refNo) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(refNo)) next.delete(refNo);
      else next.add(refNo);
      return next;
    });
  };

  const groupedTransactions = transactions.reduce((acc, curr) => {
    const key = curr.reference_number || "NO_REF";
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {});

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><span className="loading loading-spinner loading-lg"></span></div>;
  if (!student) return <div className="p-10 text-center">Student not found.</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            <div>
                <button onClick={() => navigate('/students')} className="btn btn-sm btn-ghost gap-2 mb-4 text-slate-500 hover:bg-slate-200">
                    ← Back to Students
                </button>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">STUDENT RECORD</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Transaction history and analytics.</p>
            </div>

            <div className="card bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                <div className="card-body p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-3xl font-bold text-slate-800 leading-tight break-all mb-1">{student.name}</h2>
                            <div className="font-mono text-indigo-600 font-bold tracking-tight mb-4">{student.student_id}</div>
                            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-slate-500">
                                {student.course && <span className="bg-slate-100 px-3 py-1 rounded font-semibold break-all">{student.course}</span>}
                                {student.year_level && <span className="bg-slate-100 px-3 py-1 rounded font-mono font-bold break-all">{student.year_level}</span>}
                            </div>
                        </div>

                        {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                            <div className="stats shadow-none bg-slate-50 border border-slate-200 rounded-xl flex-shrink-0">
                                <div className="stat place-items-center">
                                    <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Net Items Held</div>
                                    <div className="stat-value text-2xl text-slate-700">{stats.net_items}</div>
                                </div>
                                <div className="stat place-items-center">
                                    <div className="stat-title text-[10px] uppercase font-bold text-slate-400">Total Value</div>
                                    <div className="stat-value text-xl text-slate-700 font-bold font-mono">
                                        ₱{stats.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="card bg-white shadow-xl border border-slate-200 overflow-hidden rounded-2xl">
                <div className="card-body p-0">
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Ledger</h2>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Issuances and returns for this student</p>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto min-h-[450px]">
                        <table className="table w-full">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                                    <th className="bg-slate-50/80 py-4 pl-6 w-[20%]">Date / Ref</th>
                                    <th className="bg-slate-50/80 py-4 w-[20%]">BIS / Type</th>
                                    <th className="bg-slate-50/80 py-4 w-[25%]">Item Summary</th>
                                    <th className="bg-slate-50/80 py-4 text-center w-[15%]">Items</th>
                                    <th className="bg-slate-50/80 py-4 pr-6 text-right w-[20%]">Transaction Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tableLoading ? (
                                    <tr><td colSpan="5" className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                                ) : Object.keys(groupedTransactions).length === 0 ? (
                                    <tr><td colSpan="5" className="text-center py-16 text-slate-400 font-medium uppercase tracking-widest text-xs">No transactions recorded.</td></tr>
                                ) : (
                                    Object.entries(groupedTransactions).map(([refNo, items]) => {
                                        const nonVoidItems = items.filter(i => i.type !== 'VOID');
                                        const voidRow = items.find(i => i.type === 'VOID'); 
                                        const displayItems = nonVoidItems.length > 0 ? nonVoidItems : items;
                                        const first = nonVoidItems.length > 0 ? nonVoidItems[0] : items[0];
                                        
                                        const isVoided = items.some(i => i.is_voided) || !!voidRow;
                                        const isExpanded = expandedRows.has(refNo);
                                        const isReturn = first.type === 'ISSUANCE_RETURN';
                                        const isCashMode = first.transaction_mode === 'CASH';

                                        const totalValue = displayItems.reduce((sum, item) => {
                                            const val = isCashMode ? (item.cash_price_snapshot ?? 0) : (item.price_snapshot ?? 0);
                                            return sum + (val * item.qty);
                                        }, 0);

                                        return (
                                            <>
                                            <tr key={`row-${refNo}`} onClick={() => toggleRow(refNo)} className={`cursor-pointer transition-colors hover:bg-slate-50/70 group ${isExpanded ? 'bg-slate-50/50' : ''} ${isVoided ? 'bg-red-50/30 hover:bg-red-50/50 grayscale opacity-80' : ''}`}>
                                                <td className={`pl-6 ${isVoided ? 'border-l-4 border-l-red-400' : ''}`}>
                                                    <div className="text-xs font-semibold text-slate-700">{new Date(first.timestamp).toLocaleDateString()}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{new Date(first.timestamp).toLocaleTimeString()}</div>
                                                    <div className="font-mono text-[9px] font-bold text-slate-400 uppercase mt-2">{refNo}</div>
                                                </td>
                                                <td>
                                                    <div className={`font-mono text-lg font-bold tracking-tight ${isVoided ? 'text-red-900 line-through decoration-red-300' : 'text-slate-800'}`}>
                                                        #{first.bis_number || "---"}
                                                    </div>
                                                    <div className={`mt-1.5 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest
                                                        ${isReturn ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'}`}>
                                                        {first.type.replace('_', ' ')}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">{displayItems[0]?.product_name_snapshot}</div>
                                                    {displayItems.length > 1 && <div className="text-[10px] text-slate-500 mt-0.5 font-medium">+ {displayItems.length - 1} more item(s)</div>}
                                                </td>
                                                <td className="text-center">
                                                    <div className="text-xs font-bold text-slate-600">{displayItems.reduce((sum, i) => sum + i.qty, 0)} Units</div>
                                                </td>
                                                <td className="pr-6 text-right">
                                                    <div className={`font-mono text-base font-bold ${isReturn ? 'text-sky-600' : 'text-slate-800'}`}>
                                                        {isReturn ? '-' : ''}₱{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{first.transaction_mode || 'SRP'} Val</div>
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr className="bg-slate-50/50 border-b border-slate-200 shadow-inner">
                                                    <td colSpan="5" className="p-0">
                                                        <div className="px-6 py-5 border-l-4 border-indigo-200">
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                <div className="space-y-3">
                                                                    <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Encoded By</span><span className="text-xs font-bold text-slate-700">{first.staff_name}</span></div>
                                                                    {first.released_by && !isReturn && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Released By</span><span className="text-xs font-bold text-slate-700">{first.released_by}</span></div>}
                                                                    {first.received_by && isReturn && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Received By</span><span className="text-xs font-bold text-slate-700">{first.received_by}</span></div>}
                                                                    {isReturn && first.original_bis && <div><span className="text-[10px] font-black text-sky-500 uppercase tracking-widest block mb-1">Linked Issuance</span><span className="font-mono font-bold text-sm text-sky-700">#{first.original_bis}</span></div>}
                                                                    {isVoided && <div className="bg-red-50 border border-red-200 p-2 rounded-lg"><span className="text-[10px] font-black text-red-600 uppercase tracking-widest block mb-1">Void Status</span><span className="text-xs text-red-800 font-bold">Transaction Reverted</span></div>}
                                                                </div>

                                                                <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
                                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 border-b border-slate-100 pb-2">Item Breakdown</span>
                                                                    <div className="space-y-2">
                                                                        {displayItems.map(item => {
                                                                            const itemVal = isCashMode ? (item.cash_price_snapshot ?? 0) : (item.price_snapshot ?? 0);
                                                                            return (
                                                                                <div key={item.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                                                                                    <div className="flex-1">
                                                                                        <div className="font-semibold text-slate-800">{item.product_name_snapshot}</div>
                                                                                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.barcode_snapshot}</div>
                                                                                    </div>
                                                                                    <div className="text-right">
                                                                                        <div className="font-mono text-slate-600">{item.qty} <span className="text-slate-300 px-1">×</span> {Number(itemVal).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                                                                        <div className="font-mono font-bold text-slate-800 mt-0.5">₱{(item.qty * itemVal).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    
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