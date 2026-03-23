import { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { PasswordInput } from "../components/PasswordInput";
import { Turnstile } from "@marsidev/react-turnstile";

// Isolated component for Personal Activity Log (Optimized for zero-egress waste)
function PersonalActivityLog({ userRole }) {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return {
      start: `${yyyy}-${mm}-01`,
      end: `${yyyy}-${mm}-${dd}`
    };
  });

  useEffect(() => {
    async function fetchActivity() {
      setLoading(true);
      const startIso = new Date(`${dateRange.start}T00:00:00`).toISOString();
      const endIso = new Date(`${dateRange.end}T23:59:59.999`).toISOString();

      const { data, error } = await supabase.rpc('get_personal_activity_log', {
        p_start_date: startIso,
        p_end_date: endIso
      });
        
      if (error || !data) {
        console.error("Failed to fetch activity log:", error);
        setLoading(false);
        return;
      }

      setStats(data.stats);
      setLogs(data.logs);
      setLoading(false);
    }
    
    fetchActivity();
  }, [dateRange]);

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);

  if (loading && !stats) return <div className="text-center p-12 text-sm text-slate-400 font-medium animate-pulse bg-white rounded-xl border border-slate-200">Loading activity data...</div>;

  return (
    <div className="space-y-6">
      {/* SECTION 1: Performance Metrics (Date Filterable) */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
              <span className="loading loading-spinner text-blue-500"></span>
          </div>
        )}
        
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Performance Metrics</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1">Excludes voided transactions and reversals</p>
          </div>
          
          <div className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm rounded-lg p-1.5 px-3">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Filter Period:</span>
              <input 
                  type="date" 
                  className="bg-transparent text-[10px] font-bold text-slate-600 outline-none border-none p-0 w-24"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-slate-300 mx-1 text-xs">—</span>
              <input 
                  type="date" 
                  className="bg-transparent text-[10px] font-bold text-slate-600 outline-none border-none p-0 w-24"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              />
          </div>
        </div>

        <div className="p-6">
          {/* GRID FIX: Removed max-width for non-admins so cards fill the container width */}
          <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sales (Cash/Chg/SIP)</div>
                <div className="text-2xl font-black text-slate-700 leading-none">{stats?.issuanceCash + stats?.issuanceCharged || 0}</div>
            </div>
            
            {isAdmin && (
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-center">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Transmittals</div>
                  <div className="text-2xl font-black text-indigo-600 leading-none">{stats?.issuanceTransmittal || 0}</div>
              </div>
            )}
            
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Returns Handled</div>
                <div className="text-2xl font-black text-sky-600 leading-none">{stats?.returns || 0}</div>
            </div>
            
            {isAdmin && (
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recv / Pull-Out</div>
                <div className="text-2xl font-black text-emerald-600 leading-none">
                    {stats?.receiving || 0} <span className="text-slate-300 font-normal mx-0.5">/</span> <span className="text-amber-500">{stats?.pullOuts || 0}</span>
                </div>
                </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: Recent Transactions List */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Recent Transactions</h2>
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">Last 10 Activities</span>
        </div>
        
        <div className="overflow-x-auto">
          {logs.length === 0 ? (
            <div className="text-center p-12 text-sm text-slate-400">No recent activity found.</div>
          ) : (
              <table className="table w-full table-xs">
              <thead>
                  <tr className="bg-white text-slate-500 border-b border-slate-200">
                  <th className="py-4 font-bold pl-8">Date</th>
                  <th className="font-bold">Transaction</th>
                  <th className="font-bold">Target Entity</th>
                  <th className="text-right font-bold pr-8">Total Qty</th>
                  </tr>
              </thead>
              <tbody>
                  {logs.map((log, i) => {
                  let entityName = "System Operation";
                  if (log.type === 'RECEIVING' || log.type === 'PULL_OUT') entityName = log.supplier || "Supplier";
                  else if (log.transaction_mode === 'TRANSMITTAL') entityName = `Dept: ${log.department}`;
                  else if (log.student_name) entityName = log.student_name;

                  return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="whitespace-nowrap text-slate-600 pl-8 py-4">
                          <div className="font-medium text-slate-700">{new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">{new Date(log.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td>
                          <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-700">#{log.bis_number || "---"}</span>
                          <span className={`badge badge-sm badge-ghost text-[8px] font-bold tracking-wider uppercase border-none h-4 ${
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
                      <td className="text-right pr-8">
                          <span className="font-bold text-slate-700 text-sm">{log.total_items}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest ml-1">Qty</span>
                      </td>
                      </tr>
                  )
                  })}
              </tbody>
              </table>
          )}
        </div>
      </section>
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
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef(null);

  const handleOpenModal = () => {
    setCurrentPassword("");
    setNewPassword(""); 
    setConfirmPassword("");
    setPwError(""); 
    setPwSuccess("");
    setCaptchaToken("");
    turnstileRef.current?.reset();
    setIsModalOpen(true);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    
    if (!currentPassword) return setPwError("Current password is required.");
    if (newPassword !== confirmPassword) return setPwError("New passwords do not match.");
    if (!captchaToken) return setPwError("Security verification pending. Please wait.");
    
    setPwLoading(true);
    try {
        // 1. Re-authenticate to prove identity (consumes the CAPTCHA securely)
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: currentPassword,
          options: { captchaToken }
        });

        if (verifyError) {
          throw new Error("Incorrect current password or verification failed.");
        }

        // 2. Perform the actual password update
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          if (updateError.message.includes("Password should contain"))
              throw new Error("Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.");
          throw updateError;
        }

        setPwSuccess("Password updated securely.");
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
        setPwError(err.message || "An unexpected error occurred.");
        turnstileRef.current?.reset();
        setCaptchaToken("");
    } finally {
        setPwLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex-shrink-0 flex items-center justify-between z-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-none">ACCOUNT SETTINGS</h1>
            <p className="text-xs text-slate-500 mt-1.5 font-medium uppercase tracking-wider">Manage your security and view your activity</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          <div className="max-w-6xl mx-auto space-y-6">
            
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

            {/* The Activity Log handles its own card separation now */}
            <PersonalActivityLog userRole={userRole} />
          </div>

          {isModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
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
                      <PasswordInput 
                        label="Current Password" 
                        value={currentPassword} 
                        onChange={(e) => setCurrentPassword(e.target.value)} 
                      />
                      <div className="divider my-1 text-slate-300"></div>
                      <PasswordInput 
                        label="New Password" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                      />
                      <PasswordInput 
                        label="Confirm New Password" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                      />
                      
                      {/* Interaction-only Turnstile: Invisible unless Cloudflare suspects a bot */}
                      <div className="flex justify-center">
                        <Turnstile 
                          ref={turnstileRef}
                          siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} 
                          options={{ appearance: 'interaction-only' }}
                          onSuccess={(token) => {
                            setCaptchaToken(token);
                            setPwError("");
                          }}
                          onError={() => {
                            setCaptchaToken("");
                            setPwError("Security verification failed. Please try again.");
                          }}
                          onExpire={() => {
                            setCaptchaToken("");
                            setPwError("Security verification expired. Please modify a field to refresh.");
                          }}
                        />
                      </div>

                      <button type="submit" disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword || !captchaToken} className="btn btn-primary w-full font-bold tracking-wide mt-2">
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