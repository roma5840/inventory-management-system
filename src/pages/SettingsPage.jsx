import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { PasswordInput } from "../components/PasswordInput";

// Isolated component for Personal Activity Log
function PersonalActivityLog({ staffName, userRole }) {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      // Fetch recent non-void line items to group and extract stats
      // We fetch 500 rows to ensure we have enough data to calculate meaningful recent stats
      // and guarantee at least 10 distinct transaction groupings.
      const { data } = await supabase
        .from('vw_transaction_history')
        .select('timestamp, reference_number, type, transaction_mode, qty, student_name, supplier, department, bis_number')
        .eq('staff_name', staffName)
        .eq('is_voided', false)
        .neq('type', 'VOID')
        .order('timestamp', { ascending: false })
        .limit(500);
        
      if (!data) {
        setLoading(false);
        return;
      }

      // Group by reference number to recreate exact transactions instead of single items
      const grouped = {};
      data.forEach(row => {
        if (!grouped[row.reference_number]) {
          grouped[row.reference_number] = { ...row, total_items: 0 };
        }
        grouped[row.reference_number].total_items += row.qty;
      });

      // Sort the unique transactions back into descending order
      const groupedArray = Object.values(grouped).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Calculate Recent Stats based on the unique grouped transactions
      const calculatedStats = {
        issuanceCash: 0, issuanceCharged: 0, issuanceTransmittal: 0,
        returns: 0, receiving: 0, pullOuts: 0
      };

      groupedArray.forEach(tx => {
        if (tx.type === 'ISSUANCE') {
          if (tx.transaction_mode === 'CASH') calculatedStats.issuanceCash++;
          if (tx.transaction_mode === 'CHARGED' || tx.transaction_mode === 'SIP') calculatedStats.issuanceCharged++;
          if (tx.transaction_mode === 'TRANSMITTAL') calculatedStats.issuanceTransmittal++;
        }
        if (tx.type === 'ISSUANCE_RETURN') calculatedStats.returns++;
        if (tx.type === 'RECEIVING') calculatedStats.receiving++;
        if (tx.type === 'PULL_OUT') calculatedStats.pullOuts++;
      });

      setStats(calculatedStats);
      setLogs(groupedArray.slice(0, 10)); // Extract exactly 10 distinct grouped transactions for the table
      setLoading(false);
    }
    
    if (staffName) fetchActivity();
  }, [staffName]);

  if (loading) return <div className="text-center p-6 text-sm text-slate-400 font-medium animate-pulse">Loading recent activity...</div>;
  if (logs.length === 0) return <div className="text-center p-6 text-sm text-slate-400">No recent activity found.</div>;

  return (
    <div className="flex flex-col">
      {/* Stats Overview */}
      {stats && (
        <div className="flex flex-col bg-slate-50 border-b border-slate-100">
          {/* Disclaimer Banner */}
          <div className="px-4 py-2 border-b border-slate-200/50 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-slate-400">
              <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" />
            </svg>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Performance metrics exclude voided transactions and system reversals
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Sales (Cash/Chg/SIP)</div>
                <div className="text-xl font-black text-slate-700 leading-none mt-1">{stats.issuanceCash + stats.issuanceCharged}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Transmittals</div>
                <div className="text-xl font-black text-indigo-600 leading-none mt-1">{stats.issuanceTransmittal}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Returns Handled</div>
                <div className="text-xl font-black text-sky-600 leading-none mt-1">{stats.returns}</div>
            </div>
            {['ADMIN', 'SUPER_ADMIN'].includes(userRole) ? (
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Recv / Pull-Out</div>
                <div className="text-xl font-black text-emerald-600 leading-none mt-1">
                    {stats.receiving} <span className="text-slate-300 font-normal mx-0.5">/</span> <span className="text-amber-500">{stats.pullOuts}</span>
                </div>
                </div>
            ) : (
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 shadow-inner flex items-center justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Standard<br/>Access</span>
                </div>
            )}
            </div>
        </div>
      )}

      {/* Transaction Table */}
      <div className="overflow-x-auto">
        <table className="table w-full table-xs">
          <thead>
            <tr className="bg-white text-slate-500 border-b border-slate-200">
              <th className="py-3 font-bold pl-6">Date</th>
              <th className="font-bold">Transaction</th>
              <th className="font-bold">Target Entity</th>
              <th className="text-right font-bold pr-6">Total Qty</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => {
              let entityName = "System Operation";
              if (log.type === 'RECEIVING' || log.type === 'PULL_OUT') entityName = log.supplier || "Supplier";
              else if (log.transaction_mode === 'TRANSMITTAL') entityName = `Dept: ${log.department}`;
              else if (log.student_name) entityName = log.student_name;

              return (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="whitespace-nowrap text-slate-600 pl-6 py-3">
                    <div className="font-medium">{new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">{new Date(log.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700">#{log.bis_number || "---"}</span>
                      <span className={`badge badge-sm badge-ghost text-[9px] font-bold tracking-wider uppercase border-none ${
                        log.type === 'RECEIVING' ? 'bg-emerald-100 text-emerald-800' :
                        log.type === 'ISSUANCE' ? 'bg-rose-100 text-rose-800' :
                        log.type === 'ISSUANCE_RETURN' ? 'bg-sky-100 text-sky-800' :
                        log.type === 'PULL_OUT' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {log.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono mt-1">{log.reference_number}</div>
                  </td>
                  <td className="truncate max-w-[150px]">
                    <div className="font-medium text-slate-700 truncate" title={entityName}>{entityName}</div>
                    {log.transaction_mode && log.type === 'ISSUANCE' && (
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{log.transaction_mode}</div>
                    )}
                  </td>
                  <td className="text-right pr-6">
                    <span className="font-bold text-slate-700 text-sm">{log.total_items}</span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest ml-1">Items</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { currentUser, userRole } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const handleOpenModal = () => {
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setPwError(""); setPwSuccess("");
    setIsModalOpen(true);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (newPassword !== confirmPassword) return setPwError("New passwords do not match.");
    if (newPassword === currentPassword) return setPwError("New password cannot be the same as the current one.");
    setPwLoading(true);
    try {
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: currentPassword });
        if (reauthError) throw new Error("Current password is incorrect.");
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
        if (updateError.message.includes("Password should contain"))
            throw new Error("Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.");
        throw updateError;
        }
        setPwSuccess("Password updated. Other active devices have been signed out.");
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
        setPwError(err.message || "An unexpected error occurred.");
    } finally {
        setPwLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex-shrink-0 flex items-center justify-between z-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-none">Account Settings</h1>
            <p className="text-xs text-slate-500 mt-1.5 font-medium uppercase tracking-wider">Manage your security and view your activity</p>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Account Info Panel */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Profile Information</h2>
                <button onClick={handleOpenModal} className="btn btn-sm btn-outline border-slate-200 hover:bg-slate-800 hover:border-slate-800 hover:text-white text-slate-600 font-bold text-[10px] tracking-widest uppercase gap-1.5 normal-case">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 1 3.5 3.5V7A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7V4.5A3.5 3.5 0 0 1 8 1Zm0 1.5A2 2 0 0 0 6 4.5V7h4V4.5A2 2 0 0 0 8 2.5Z" clipRule="evenodd" />
                  </svg>
                  Change Password
                </button>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                  <div className="text-sm font-semibold text-slate-800">{currentUser?.fullName}</div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Address</label>
                  <div className="text-sm font-semibold text-slate-800">{currentUser?.email}</div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">System Role</label>
                  <div className="text-sm font-semibold text-slate-800">{userRole?.replace('_', ' ')}</div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Account Status</label>
                  <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-700">
                    {currentUser?.status}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className="lg:col-span-12 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">My Recent Transactions</h2>
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">Last 10 Actions</span>
                </div>
                <PersonalActivityLog staffName={currentUser?.fullName} userRole={userRole} />
              </section>
            </div>
          </div>

          {isModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 leading-none">Change Password</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1.5">Security Update</p>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
                  {pwError && <div className="alert alert-error text-xs py-2 shadow-sm">{pwError}</div>}
                  {pwSuccess && <div className="alert alert-success text-xs py-2 shadow-sm">{pwSuccess}</div>}

                  {!pwSuccess && (
                    <>
                      <PasswordInput label="Current Password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                      <div className="divider my-0"></div>
                      <PasswordInput label="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      <PasswordInput label="Confirm New Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                      <button type="submit" disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword} className="btn btn-primary w-full font-bold tracking-wide mt-2">
                        {pwLoading ? <span className="loading loading-spinner loading-sm"></span> : "Update Password"}
                      </button>
                    </>
                  )}

                  {pwSuccess && (
                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-ghost w-full font-bold">
                      Close
                    </button>
                  )}
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}