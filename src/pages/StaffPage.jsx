import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import LimitedInput from "../components/LimitedInput";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";

export default function StaffPage() {
  const { userRole, currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  
  // Pagination & Search State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 15;

  // Stats State
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0 });
  
  const [editingNameId, setEditingNameId] = useState(null);
  const [tempName, setTempName] = useState("");
  const [processingUsers, setProcessingUsers] = useState([]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Toast State
  const [toast, setToast] = useState(null);
  const showToast = (message, subMessage, type = "success") => setToast({ message, subMessage, type });

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("EMPLOYEE");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  
  const [reAuth, setReAuth] = useState({ isOpen: false, action: null, payload: null, password: '', error: '', loading: false });

  if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) return <div className="p-10 text-center text-error">Access Denied</div>;

  // Logic: Super Admin can edit everyone. Admin can only edit Employees.
  const canToggleStatus = (targetUser) => {
    if (userRole === 'SUPER_ADMIN') return true;
    if (userRole === 'ADMIN') return targetUser.role === 'EMPLOYEE';
    return false;
  };

  const canManage = (targetUser) => {
    if (userRole === 'SUPER_ADMIN') return true; 
    if (userRole === 'ADMIN') return targetUser.role === 'EMPLOYEE'; 
    return false;
  };

  const startEditName = (user) => {
    setSelectedUser(user);
    setTempName(user.fullName || "");
    setIsEditModalOpen(true);
  };

  const saveName = async () => {
    if (!tempName.trim()) return showToast("Validation Error", "Name cannot be empty", "error");
    
    setProcessingUsers(prev => [...prev, selectedUser.id]);
    try {
        // SECURE UPDATE: Use RPC instead of direct table update
        const { error } = await supabase.rpc('update_staff_name', {
            target_id: selectedUser.id,
            new_name: tempName.trim()
        });

        if (error) throw error;

        setIsEditModalOpen(false);
        showToast("Update Successful", `Personnel name updated to ${tempName.trim()}.`);
        setRefreshTrigger(prev => prev + 1);
        
        await supabase.channel('app_updates').send({
            type: 'broadcast',
            event: 'staff_update',
            payload: {} 
        });

    } catch (err) {
        showToast("Update Failed", err.message, "error");
    } finally {
        setProcessingUsers(prev => prev.filter(id => id !== selectedUser.id));
    }
  };


  // Subscribe to Authorized Users via Broadcast
  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedTerm(searchTerm);
        setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const fetchStaff = async () => {
        setLoading(true);
        
        // 1. Fetch Stats for the header cards
        const { data: allStaff } = await supabase.from('authorized_users').select('status');
        if (allStaff) {
            setStats({
                total: allStaff.length,
                active: allStaff.filter(s => s.status === 'REGISTERED').length,
                pending: allStaff.filter(s => s.status === 'PENDING').length
            });
        }

        // 2. Build Paginated Query
        let query = supabase
            .from('authorized_users')
            .select('*, fullName:full_name', { count: 'exact' });

        if (debouncedTerm.trim()) {
            // FIX: Replace commas with '_' to prevent breaking the Supabase .or() syntax delimiter
            const safeTerm = debouncedTerm.replace(/,/g, '_');
            query = query.or(`full_name.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%`);
        } else {
            query = query.order('created_at', { ascending: false });
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        const { data, count } = await query.range(from, to);

        if(data) {
            setStaff(data);
            setTotalCount(count || 0);
        }
        setLoading(false);
    }
    
    fetchStaff();

    const dbChannel = supabase.channel('staff_db_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'authorized_users' }, () => {
            setRefreshTrigger(prev => prev + 1);
        })
        .subscribe();

    const appChannel = supabase.channel('app_updates')
        .on('broadcast', { event: 'staff_update' }, () => {
            setRefreshTrigger(prev => prev + 1);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(dbChannel);
        supabase.removeChannel(appChannel);
    };
  }, [refreshTrigger, debouncedTerm, currentPage]);

  const callSecureApi = async (action, payload, password) => {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session");

    const makeRequest = async (token) => {
      return fetch('/api/manage-staff', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          action,
          password,
          targetId: payload.user?.id,
          targetEmail: payload.email,
          targetName: payload.name,
          newRole: payload.newRole || payload.role
        })
      });
    };

    let response = await makeRequest(session.access_token);
    if (response.status === 401) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) throw new Error("Session expired. Please refresh the page.");
      response = await makeRequest(refreshData.session.access_token);
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Secure operation failed");
    return data;
  };

  const changeRole = (user, newRole) => {
    if (userRole !== 'SUPER_ADMIN') return showToast("Access Denied", "Only Super Admins can change roles.", "error");
    if (user.id === currentUser.id) return showToast("Action Blocked", "You cannot change your own role.", "error");
    setReAuth({ isOpen: true, action: 'CHANGE_ROLE', payload: { user, newRole }, password: '', error: '', loading: false });
  };

  const toggleStatus = (user) => {
    if (!canToggleStatus(user)) return showToast("Permission Denied", "You cannot change this user's status.", "error");
    if (user.id === currentUser.id) return showToast("Action Blocked", "You cannot deactivate your own account.", "error");
    setReAuth({ isOpen: true, action: 'TOGGLE_STATUS', payload: { user }, password: '', error: '', loading: false });
  };

  const revokeAccess = (user) => {
    if (!canManage(user)) return showToast("Permission Denied", "You cannot delete this user.", "error");
    setReAuth({ isOpen: true, action: 'REVOKE', payload: { user }, password: '', error: '', loading: false });
  };

  const handleReAuthSubmit = async (e) => {
    e.preventDefault();
    setReAuth(prev => ({ ...prev, loading: true, error: '' }));
    try {
        const { action, payload, password } = reAuth;
        setProcessingUsers(prev => [...prev, payload.user.id]);

        const res = await callSecureApi(action, payload, password);

        if (action === 'REVOKE') showToast("Access Revoked", `${payload.user.fullName} has been removed.`, "delete");
        else if (action === 'CHANGE_ROLE') showToast("Role Updated", `${payload.user.fullName}'s role changed to ${payload.newRole.replace('_', ' ')}.`);
        else if (action === 'TOGGLE_STATUS') showToast("Status Updated", `${payload.user.fullName} is now ${res.newStatus.toLowerCase()}.`);
        
        setRefreshTrigger(prev => prev + 1);
        await supabase.channel('app_updates').send({
            type: 'broadcast', event: 'staff_update', payload: {}
        });
        setReAuth({ isOpen: false, action: null, payload: null, password: '', error: '', loading: false });
    } catch (err) {
        setReAuth(prev => ({ ...prev, error: err.message, loading: false }));
    } finally {
        if (reAuth.payload?.user) {
            setProcessingUsers(prev => prev.filter(id => id !== reAuth.payload.user.id));
        }
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim() || !invitePassword) return;
    setInviteLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication error: No active session found.");

      await callSecureApi('INVITE', { email: inviteEmail.trim().toLowerCase(), name: inviteName.trim(), role: inviteRole }, invitePassword);

      await supabase.channel('app_updates').send({
        type: 'broadcast',
        event: 'staff_update',
        payload: {} 
      });

      const emailResponse = await fetch('/api/send-invite-email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
          to_name: inviteName.trim(),
          to_email: inviteEmail.trim().toLowerCase(),
          invite_link: `${window.location.origin}/register` 
        })
      });

      if (!emailResponse.ok) {
        const errData = await emailResponse.json();
        throw new Error(errData.error || "User added to DB, but email dispatch failed.");
      }

      showToast("Invitation Sent", `Successfully invited ${inviteName.trim()}`);
      setIsInviteModalOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("EMPLOYEE");
      setInvitePassword("");
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      showToast("Invite Failed", error.message, "error");
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">STAFF MANAGEMENT</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Manage user roles, access status, and system permissions.</p>
            </div>

            {/* Statistics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 leading-none">{stats.total}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Personnel</div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 leading-none">{stats.active}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Active Accounts</div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 leading-none">{stats.pending}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pending Invites</div>
                    </div>
                </div>
            </div>

            <div className="card bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                {/* Action Bar (Matches SupplierPage) */}
                <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row justify-between items-center bg-white rounded-t-xl gap-4">
                <div className="flex flex-col lg:flex-row items-center gap-6 w-full xl:w-auto">
                    <div className="text-center lg:text-left">
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase">Personnel Directory</h2>
                    </div>

                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                    <button 
                        onClick={() => setIsInviteModalOpen(true)}
                        className="btn btn-sm btn-primary rounded-lg px-4 gap-2 h-8 normal-case"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Invite User</span>
                    </button>
                    </div>
                </div>

                <div className="relative w-full xl:w-72">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    </div>
                    <input 
                    type="text" 
                    placeholder="Search Name or Email..." 
                    className="input input-sm w-full pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all text-xs rounded-lg h-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                </div>
                </div>

                <div className="overflow-x-auto min-h-[450px]">
                <table className="table w-full">
                    <thead>
                    <tr className="bg-slate-50/80 backdrop-blur-sm text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200">
                        <th className="bg-slate-50/80 pl-6 py-4">Personnel</th>
                        <th className="bg-slate-50/80 text-center py-4">Status</th>
                        <th className="bg-slate-50/80 py-4">Assigned Role</th>
                        <th className="bg-slate-50/80 text-right pr-6 py-4">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {loading ? (
                        <tr><td colSpan="4" className="text-center py-20"><span className="loading loading-spinner loading-lg text-slate-300"></span></td></tr>
                    ) : staff.length === 0 ? (
                        <tr><td colSpan="4" className="text-center py-24 text-slate-400 font-medium">No personnel records found.</td></tr>
                    ) : staff.map((user) => {
                        const isSelf = user.id === currentUser.id;
                        return (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="pl-6 py-4 align-middle">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0 border border-slate-200 uppercase">
                                {(user.fullName || user.email).slice(0, 2)}
                                </div>
                                <div className="min-w-0">
                                <div className="font-bold text-slate-800 flex items-center gap-2">
                                    <span className="truncate">{user.fullName || "Unregistered"}</span>
                                    {canManage(user) && (
                                    <button 
                                        onClick={() => startEditName(user)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all tooltip tooltip-right"
                                        data-tip="Edit Name"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                    )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-medium truncate">{user.email}</div>
                                </div>
                            </div>
                            </td>

                            <td className="text-center align-middle">
                            {user.status === 'REGISTERED' 
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-tighter">Active</span>
                                : user.status === 'INACTIVE'
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-tighter">Inactive</span>
                                : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-tighter">Pending</span>
                            }
                            </td>

                            <td className="align-middle">
                            {userRole === 'SUPER_ADMIN' && !isSelf ? (
                                <select 
                                className="select select-bordered select-sm w-full max-w-[160px] font-bold text-[11px] uppercase tracking-tight bg-slate-50 border-slate-200 h-8 min-h-0 focus:bg-white transition-all"
                                value={user.role}
                                onChange={(e) => changeRole(user, e.target.value)}
                                >
                                <option value="EMPLOYEE">Employee</option>
                                <option value="ADMIN">Admin</option>
                                <option value="SUPER_ADMIN">Super Admin</option>
                                </select>
                            ) : (
                                <div className="font-bold text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg inline-block">
                                {user.role.replace('_', ' ')}
                                {isSelf && <span className="ml-1 opacity-50 text-[9px]">(You)</span>}
                                </div>
                            )}
                            </td>

                            <td className="text-right align-middle pr-6">
                            {processingUsers.includes(user.id) ? (
                                <span className="loading loading-spinner loading-sm text-slate-300"></span>
                            ) : (
                                !isSelf && canManage(user) && (
                                <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {user.status !== 'PENDING' && canToggleStatus(user) && (
                                    <button 
                                        onClick={() => toggleStatus(user)}
                                        className={`p-1.5 rounded-md transition-all tooltip tooltip-left ${user.status === 'INACTIVE' ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                        data-tip={user.status === 'INACTIVE' ? "Reactivate User" : "Deactivate User"}
                                    >
                                        {user.status === 'INACTIVE' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                                        </svg>
                                        ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.3} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                                        </svg>
                                        )}
                                    </button>
                                    )}
                                    
                                    <button 
                                    onClick={() => revokeAccess(user)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all tooltip tooltip-left"
                                    data-tip="Revoke Access"
                                    >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                    </button>
                                </div>
                                )
                            )}
                            </td>
                        </tr>
                        )})}
                    </tbody>
                </table>
                </div>
                
                <Pagination 
                totalCount={totalCount}
                itemsPerPage={ITEMS_PER_PAGE}
                currentPage={currentPage}
                onPageChange={(p) => setCurrentPage(p)}
                loading={loading}
                />
            </div>
        </div>
      </main>

      {/* === AUTHORIZE NEW USER MODAL === */}
      {isInviteModalOpen && (
      <div className="modal modal-open">
          <div className="modal-box max-w-lg p-0 overflow-hidden border border-slate-200 shadow-2xl">
          <div className="p-6 border-b bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Authorize New User</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Send a secure invitation to the system.</p>
          </div>
          
          <div className="p-6">
              <form onSubmit={handleInvite} className="flex flex-col gap-4">
                  <div className="form-control">
                      <label className="label py-1">
                      <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address *</span>
                      </label>
                      <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1 1 0 00.918 0L19 7.161V6a2 2 0 00-2-2H3z" />
                          <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                          </svg>
                      </div>
                      <LimitedInput 
                          type="email" 
                          maxLength={300}
                          disabled={inviteLoading}
                          className="input input-bordered w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white text-sm" 
                          placeholder="staff@institution.edu"
                          value={inviteEmail}
                          onChange={e => setInviteEmail(e.target.value)}
                          required
                      />
                      </div>
                  </div>

                  <div className="form-control">
                      <label className="label py-1">
                      <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name *</span>
                      </label>
                      <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.230 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1a1.23 1.23 0 00.41-1.412 6.533 6.533 0 00-13.076 0z" />
                          </svg>
                      </div>
                      <LimitedInput 
                          type="text"
                          maxLength={150}
                          disabled={inviteLoading}
                          className="input input-bordered w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white text-sm" 
                          placeholder="Enter Formal Name"
                          value={inviteName}
                          onChange={e => setInviteName(e.target.value)}
                          required
                      />
                      </div>
                  </div>

                  {userRole === 'SUPER_ADMIN' && (
                  <div className="form-control mb-2">
                      <label className="label py-1">
                          <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Role *</span>
                      </label>
                      <select 
                          className="select select-bordered w-full bg-slate-50 border-slate-200 text-sm font-semibold"
                          value={inviteRole}
                          disabled={inviteLoading}
                          onChange={e => setInviteRole(e.target.value)}
                          required
                      >
                          <option value="EMPLOYEE">Employee</option>
                          <option value="ADMIN">Administrator</option>
                          <option value="SUPER_ADMIN">Super Administrator</option>
                      </select>
                  </div>
                  )}

                  <div className="form-control mb-2">
                      <label className="label py-1">
                          <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Password (Authorization) *</span>
                      </label>
                      <LimitedInput
                          type="password"
                          disabled={inviteLoading}
                          className="input input-bordered w-full bg-slate-50 border-slate-200 focus:bg-white text-sm"
                          placeholder="Enter your password to authorize"
                          value={invitePassword}
                          onChange={e => setInvitePassword(e.target.value)}
                          required
                      />
                  </div>

                  <div className="modal-action mt-4 pt-4 border-t border-slate-100 flex justify-end gap-2">
                      <button 
                      type="button" 
                      disabled={inviteLoading}
                      className="btn btn-ghost text-slate-500 normal-case" 
                      onClick={() => {
                          setIsInviteModalOpen(false);
                          setInviteEmail("");
                          setInviteName("");
                          setInviteRole("EMPLOYEE");
                          setInvitePassword("");
                      }}>
                      Cancel
                      </button>
                      <button 
                      type="submit" 
                      disabled={inviteLoading} 
                      className="btn btn-primary px-6 normal-case"
                      >
                          {inviteLoading ? (
                          <span className="loading loading-spinner loading-sm"></span>
                          ) : (
                          "Send Authorization"
                          )}
                      </button>
                  </div>
              </form>
          </div>
          </div>
      </div>
      )}
      
      {/* Edit User Modal */}
      {isEditModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm p-0 overflow-hidden border border-slate-200 shadow-2xl">
            <div className="p-6 border-b bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Edit Personnel</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Update display name for {selectedUser?.email}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-control w-full">
                <label className="label py-1">
                  <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name</span>
                </label>
                <LimitedInput 
                  type="text" 
                  maxLength={150}
                  className="input input-bordered w-full bg-slate-50 focus:bg-white font-semibold"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
              <button 
                onClick={() => setIsEditModalOpen(false)} 
                disabled={processingUsers.includes(selectedUser?.id)}
                className="btn btn-sm btn-ghost text-slate-500 normal-case"
              >
                Cancel
              </button>
              <button 
                onClick={saveName} 
                disabled={processingUsers.includes(selectedUser?.id)}
                className="btn btn-sm btn-primary px-6 normal-case"
              >
                {processingUsers.includes(selectedUser?.id) ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  "Update Name"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-Auth Security Modal */}
      {reAuth.isOpen && (
        <div className="modal modal-open">
            <div className="modal-box max-w-sm p-0 overflow-hidden border border-slate-200 shadow-2xl">
                <div className="p-6 border-b bg-rose-50">
                    <h3 className="font-bold text-lg text-rose-800">Security Verification</h3>
                    <p className="text-xs text-rose-600 font-medium mt-1">
                        {reAuth.action === 'REVOKE' && `You are about to permanently revoke access for ${reAuth.payload.user.fullName}.`}
                        {reAuth.action === 'TOGGLE_STATUS' && `You are about to ${reAuth.payload.user.status === 'INACTIVE' ? 'reactivate' : 'deactivate'} access for ${reAuth.payload.user.fullName}.`}
                        {reAuth.action === 'CHANGE_ROLE' && `You are about to change the role of ${reAuth.payload.user.fullName} to ${reAuth.payload.newRole.replace('_', ' ')}.`}
                    </p>
                </div>
                <div className="p-6">
                    <form onSubmit={handleReAuthSubmit} className="flex flex-col gap-4">
                        {reAuth.error && (
                            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg font-medium border border-red-100">
                                {reAuth.error}
                            </div>
                        )}
                        <div className="form-control">
                            <label className="label py-1">
                                <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Password *</span>
                            </label>
                            <LimitedInput
                                type="password"
                                className="input input-bordered w-full bg-slate-50 border-slate-200 focus:bg-white text-sm font-sans"
                                placeholder="Enter password to confirm"
                                disabled={reAuth.loading}
                                value={reAuth.password}
                                onChange={e => setReAuth(prev => ({ ...prev, password: e.target.value }))}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={reAuth.loading}
                                className="btn btn-ghost text-slate-500 normal-case"
                                onClick={() => setReAuth({ isOpen: false, action: null, payload: null, password: '', error: '', loading: false })}
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={reAuth.loading} 
                                className={`btn btn-primary ${reAuth.loading ? 'loading' : ''}`}
                            >
                                {reAuth.loading ? <span className="loading loading-spinner loading-sm"></span> : "Confirm Action"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
      
      {toast && (
        <Toast 
          message={toast.message} 
          subMessage={toast.subMessage} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}
