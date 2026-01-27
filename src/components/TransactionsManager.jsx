import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function TransactionsManager() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFilter, setDateFilter] = useState("7DAYS"); // TODAY, 7DAYS, 30DAYS, ALL
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL"); // Only for Issuance
  const [searchRef, setSearchRef] = useState("");

  useEffect(() => {
    fetchTransactions();
  }, [dateFilter, typeFilter, modeFilter]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .order('timestamp', { ascending: false });

      // 1. Date Filter Logic
      const now = new Date();
      if (dateFilter === "TODAY") {
        const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();
        query = query.gte('timestamp', startOfDay);
      } else if (dateFilter === "7DAYS") {
        const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
        query = query.gte('timestamp', sevenDaysAgo);
      } else if (dateFilter === "30DAYS") {
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).toISOString();
        query = query.gte('timestamp', thirtyDaysAgo);
      }

      // 2. Type Filter
      if (typeFilter !== "ALL") {
        query = query.eq('type', typeFilter);
      }

      // 3. Mode Filter (Only applies if Type is Issuance or All)
      if (modeFilter !== "ALL") {
        query = query.eq('transaction_mode', modeFilter);
      }

      const { data: txData, error } = await query;
      if (error) throw error;

      // 4. Fetch Staff Names manually (Join)
      const userIds = [...new Set(txData.map(t => t.user_id).filter(Boolean))];
      let userMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('authorized_users')
          .select('auth_uid, full_name, email')
          .in('auth_uid', userIds); 
        users?.forEach(u => userMap[u.auth_uid] = u.full_name || u.email);
      }

      // 5. Enrich Data
      const enriched = txData.map(t => ({
        ...t,
        staff_name: userMap[t.user_id] || 'Unknown'
      }));

      setTransactions(enriched);

    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  // Grouping Logic
  const groupedTransactions = transactions.reduce((acc, curr) => {
    // Search Filter applied post-fetch for client-side responsiveness
    if (searchRef && !curr.reference_number.toLowerCase().includes(searchRef.toLowerCase()) && 
        !curr.student_name?.toLowerCase().includes(searchRef.toLowerCase())) {
        return acc;
    }

    const key = curr.reference_number || "NO_REF";
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {});

  return (
    <div className="card bg-white shadow-lg border border-gray-200">
      <div className="card-body p-6">
        
        {/* HEADER & FILTERS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b pb-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">Transaction Ledger</h2>
                <p className="text-sm text-gray-500">View and audit all inventory movements</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
                {/* Date Filter */}
                <select className="select select-sm select-bordered" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                    <option value="TODAY">Today</option>
                    <option value="7DAYS">Last 7 Days</option>
                    <option value="30DAYS">Last 30 Days</option>
                    <option value="ALL">All Time</option>
                </select>

                {/* Type Filter */}
                <select className="select select-sm select-bordered" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setModeFilter("ALL"); }}>
                    <option value="ALL">All Types</option>
                    <option value="ISSUANCE">Issuance</option>
                    <option value="RECEIVING">Receiving</option>
                    <option value="ISSUANCE_RETURN">Return</option>
                    <option value="PULL_OUT">Pull Out</option>
                </select>

                {/* Mode Filter - Only show if relevant */}
                {(typeFilter === "ALL" || typeFilter === "ISSUANCE") && (
                     <select className="select select-sm select-bordered" value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
                        <option value="ALL">All Modes</option>
                        <option value="CASH">Cash</option>
                        <option value="CHARGED">Charged</option>
                        <option value="SIP">SIP</option>
                        <option value="TRANSMITTAL">Transmittal</option>
                    </select>
                )}
                
                {/* Search */}
                <input 
                    type="text" 
                    placeholder="Search Ref or Student..." 
                    className="input input-sm input-bordered"
                    value={searchRef}
                    onChange={e => setSearchRef(e.target.value)}
                />
            </div>
        </div>

        {/* DETAILED TABLE */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="table w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-32">Date / Ref</th>
                <th className="w-24">Type</th>
                <th className="w-48">Entity (Student/Supp)</th>
                <th>Items Breakdown</th>
                <th className="text-right w-24">Total Value</th>
                <th className="w-32 text-right">Staff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                  <tr><td colSpan="6" className="text-center py-10">Loading records...</td></tr>
              ) : Object.keys(groupedTransactions).length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-10 text-gray-400">No transactions found matching filters.</td></tr>
              ) : (
                  Object.entries(groupedTransactions).map(([refNo, items]) => {
                      const first = items.find(i => i.type !== 'VOID') || items[0];
                      const isVoided = items.some(i => i.is_voided);
                      const isReversal = first.type === 'VOID';

                      // Calculate Total Value for this Receipt
                      const totalValue = items.reduce((sum, item) => {
                          if (item.type === 'VOID') return sum;
                          const price = item.price_snapshot !== null ? item.price_snapshot : item.price;
                          return sum + (price * item.qty);
                      }, 0);

                      return (
                          <tr key={refNo} className={`border-b hover:bg-gray-50 align-top ${isVoided ? 'opacity-60 bg-gray-50' : ''} ${isReversal ? 'bg-red-50' : ''}`}>
                              {/* 1. Ref & Date */}
                              <td className="py-4">
                                  <div className="font-mono font-bold text-xs">{refNo}</div>
                                  <div className="text-[10px] text-gray-500">{new Date(first.timestamp).toLocaleDateString()}</div>
                                  <div className="text-[10px] text-gray-400">{new Date(first.timestamp).toLocaleTimeString()}</div>
                                  {isVoided && <span className="badge badge-xs badge-error mt-1">VOIDED</span>}
                              </td>

                              {/* 2. Type & Mode */}
                              <td className="py-4">
                                  <div className={`badge badge-sm font-bold border-0 
                                      ${first.type === 'RECEIVING' ? 'bg-green-100 text-green-800' : 
                                        first.type === 'ISSUANCE' ? 'bg-blue-100 text-blue-800' : 
                                        first.type === 'ISSUANCE_RETURN' ? 'bg-indigo-100 text-indigo-800' :
                                        first.type === 'PULL_OUT' ? 'bg-orange-100 text-orange-800' : 'bg-gray-200 text-gray-800'}`
                                  }>
                                      {first.type.replace('_', ' ')}
                                  </div>
                                  {first.transaction_mode && (
                                      <div className="mt-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                          {first.transaction_mode}
                                      </div>
                                  )}
                              </td>

                              {/* 3. Entity */}
                              <td className="py-4">
                                  {first.student_name ? (
                                      <div>
                                          <div className="font-bold text-xs">{first.student_name}</div>
                                          <div className="text-[10px] text-gray-500">{first.course} {first.year_level}</div>
                                      </div>
                                  ) : first.supplier ? (
                                      <div>
                                          <span className="text-[10px] text-gray-400 uppercase">Supplier</span>
                                          <div className="font-bold text-xs">{first.supplier}</div>
                                      </div>
                                  ) : (
                                      <span className="text-gray-400 italic text-xs">N/A</span>
                                  )}
                                  {first.remarks && (
                                      <div className="mt-2 text-[10px] bg-yellow-50 text-yellow-800 p-1 rounded border border-yellow-100">
                                          {first.remarks}
                                      </div>
                                  )}
                              </td>

                              {/* 4. Items List */}
                              <td className="py-4">
                                  <div className="space-y-1">
                                      {items.filter(i => i.type !== 'VOID').map(item => (
                                          <div key={item.id} className="flex justify-between items-center text-xs border-b border-dashed border-gray-200 pb-1 last:border-0">
                                              <span className="truncate max-w-[200px]" title={item.product_name_snapshot || item.product_name}>
                                                  {item.product_name_snapshot || "Item"}
                                              </span>
                                              <span className="font-mono text-gray-500 whitespace-nowrap ml-2">
                                                  {item.qty} x {Number(item.price_snapshot ?? item.price).toFixed(2)}
                                              </span>
                                          </div>
                                      ))}
                                  </div>
                              </td>

                              {/* 5. Total Value */}
                              <td className="py-4 text-right font-mono font-bold text-sm">
                                  {first.type === 'ISSUANCE_RETURN' ? '-' : ''}
                                  {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>

                              {/* 6. Staff */}
                              <td className="py-4 text-right">
                                  <div className="text-xs font-semibold">{first.staff_name}</div>
                                  {/* If Voided, show who voided it if available in the void row */}
                                  {isVoided && (
                                      <div className="text-[10px] text-red-500 mt-1">
                                          Void Reason: {items.find(i => i.type === 'VOID')?.void_reason || first.void_reason || "N/A"}
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
      </div>
    </div>
  );
}