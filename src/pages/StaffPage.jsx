import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import AdminInvite from "../components/AdminInvite";
import Sidebar from "../components/Sidebar";

export default function StaffPage() {
  const { userRole, currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  
  // NEW: State for Inline Renaming
  const [editingNameId, setEditingNameId] = useState(null);
  const [tempName, setTempName] = useState("");

  const [processingUsers, setProcessingUsers] = useState([]);

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

  // NEW: Rename Handlers
  const startEditName = (user) => {
    setEditingNameId(user.id);
    setTempName(user.fullName || "");
  };

  const saveName = async (user) => {
    if (!tempName.trim()) return alert("Name cannot be empty");
    
    try {
        const { error } = await supabase
            .from('authorized_users')
            .update({ full_name: tempName })
            .eq('id', user.id);

        if (error) throw error;

        setEditingNameId(null);
        setRefreshTrigger(prev => prev + 1);
        
        // Broadcast change to other tabs
        await supabase.channel('app_updates').send({
            type: 'broadcast',
            event: 'staff_update',
            payload: {} 
        });

    } catch (err) {
        alert("Update failed: " + err.message);
    }
  };


  // Subscribe to Authorized Users via Broadcast
  useEffect(() => {
    const fetchStaff = async () => {
        const { data } = await supabase
            .from('authorized_users')
            .select('*, fullName:full_name')
            .order('created_at', { ascending: false });
        if(data) setStaff(data);
        setLoading(false);
    }
    
    fetchStaff();

    // 1. Listen for DB changes (e.g. Status Pending -> Registered)
    const dbChannel = supabase.channel('staff_db_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'authorized_users' }, () => {
            fetchStaff();
        })
        .subscribe();

    // 2. Listen for Broadcasts (e.g. Admin invites from other tabs)
    const appChannel = supabase.channel('app_updates')
        .on('broadcast', { event: 'staff_update' }, () => {
            fetchStaff();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(dbChannel);
        supabase.removeChannel(appChannel);
    };
  }, [refreshTrigger]);

  const changeRole = async (user, newRole) => {
    if (userRole !== 'SUPER_ADMIN') return alert("Only Super Admins can change roles.");
    
    // Safety check: Prevent locking yourself out (optional but recommended)
    if (user.id === currentUser.id) return alert("You cannot change your own role here.");

    if (confirm(`Change ${user.fullName}'s role to ${newRole}?`)) {
        const { error } = await supabase.from('authorized_users').update({ role: newRole }).eq('id', user.id);
        if (error) {
            alert(error.message);
        } else {
            setRefreshTrigger(prev => prev + 1); // Refresh local
            await supabase.channel('app_updates').send({ // Notify others
                type: 'broadcast',
                event: 'staff_update',
                payload: {} 
            });
        }
    } else {
        // If cancelled, trigger a refresh to reset the dropdown UI back to original value
        setRefreshTrigger(prev => prev + 1);
    }
  };

  // --- NEW: Helper for Secure API Calls with Auto-Refresh ---
  const callCloudflareSync = async (email, action) => {
    // 1. Get current session
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session");

    // 2. Define the fetch logic
    const makeRequest = async (token) => {
      return fetch('/api/cf-sync', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ email, action })
      });
    };

    // 3. Try the request
    let response = await makeRequest(session.access_token);

    // 4. If 401 (Unauthorized), try to refresh token and retry ONCE
    if (response.status === 401) {
      console.log("Token expired, attempting refresh...");
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshData.session) {
        throw new Error("Session expired. Please refresh the page.");
      }

      // Retry with new token
      response = await makeRequest(refreshData.session.access_token);
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Cloudflare Sync Failed");
    }
  };
  // ----------------------------------------------------------

  const toggleStatus = async (user) => {
    if (!canToggleStatus(user)) return alert("You do not have permission to change this user's status.");
    if (user.id === currentUser.id) return alert("You cannot deactivate your own account.");

    const newStatus = user.status === 'INACTIVE' ? 'REGISTERED' : 'INACTIVE';
    const action = newStatus === 'INACTIVE' ? 'DEACTIVATE' : 'REACTIVATE';

    if (confirm(`Are you sure you want to ${action} access for ${user.fullName}?`)) {
        // Add user to processing list
        setProcessingUsers(prev => [...prev, user.id]);

        try {
            const { error } = await supabase
                .from('authorized_users')
                .update({ status: newStatus })
                .eq('id', user.id);

            if (error) throw error;

            // --- CLOUDFLARE SYNC (SECURED) ---
            const cfAction = newStatus === 'INACTIVE' ? 'remove' : 'add';
            await callCloudflareSync(user.email, cfAction);
            // -----------------------

            setRefreshTrigger(prev => prev + 1);
            
            await supabase.channel('app_updates').send({
                type: 'broadcast',
                event: 'staff_update',
                payload: { targetId: user.id, status: newStatus } 
            });

        } catch (err) {
            alert(`Failed to ${action.toLowerCase()} user: ` + err.message);
        } finally {
            // Remove user from processing list regardless of success/failure
            setProcessingUsers(prev => prev.filter(id => id !== user.id));
        }
    }
  };

  const revokeAccess = async (user) => {
    if (!canManage(user)) return alert("You do not have permission to delete this user.");
    
    if (confirm(`Are you sure you want to REVOKE access for ${user.fullName}?`)) {
        setProcessingUsers(prev => [...prev, user.id]);

        try {
            // CALL THE SECURE SQL FUNCTION
            const { error } = await supabase.rpc('delete_staff_account', { 
                target_record_id: user.id 
            });

            if (error) throw error;

            // --- CLOUDFLARE SYNC (SECURED) ---
            await callCloudflareSync(user.email, 'remove');
            // -----------------------

            setRefreshTrigger(prev => prev + 1); 

            await supabase.channel('app_updates').send({ 
                type: 'broadcast',
                event: 'staff_update',
                payload: {} 
            });

        } catch (err) {
            console.error("Revoke failed:", err);
            alert("Failed to revoke access: " + err.message);
        } finally {
            setProcessingUsers(prev => prev.filter(id => id !== user.id));
        }
    }
  };

  if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) return <div className="p-10 text-center text-error">Access Denied</div>;


  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Management</h1>
                <p className="text-sm text-slate-500">Manage user roles, access status, and system permissions.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* LEFT: Invite Form */}
                <div className="w-full lg:w-1/4 lg:sticky lg:top-0">
                <AdminInvite onSuccess={() => setRefreshTrigger(prev => prev + 1)} />
                <div className="mt-4 p-4 text-xs text-gray-500 bg-white rounded-lg shadow border">
                    <p className="font-bold text-gray-700">Privilege Levels:</p>
                    <ul className="list-disc pl-4 mt-2 space-y-1">
                        <li><strong>Super Admin:</strong> Full control over all users.</li>
                        <li><strong>Admin:</strong> Can manage Employees only.</li>
                        <li><strong>Employee:</strong> No access to this page.</li>
                    </ul>

                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="font-bold text-gray-700">Access Management:</p>
                        <ul className="list-disc pl-4 mt-2 space-y-2">
                            <li>
                                <strong>Deactivating (Pause icon):</strong> Removes their ability to log in, but their name remains visible in existing transaction logs.
                            </li>
                            <li>
                                <strong>Revoking (X icon):</strong> Completely deletes the user and removes their name/identity from all transaction history logs.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* RIGHT: User List */}
            <div className="w-full lg:w-3/4 card bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-4 border-b">
                    <h2 className="card-title text-gray-700">Authorized Personnel ({staff.length})</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="table w-full">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="w-1/3">Name / Email</th>
                                <th className="text-center w-24">Status</th>
                                <th className="w-48">Assigned Role</th>
                                <th className="text-center w-32">Controls</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="4" className="text-center py-4">Loading...</td></tr>
                            ) : staff.map((user) => {
                                const isSelf = user.id === currentUser.id;
                                return (
                                <tr key={user.id} className="hover">
                                    {/* COLUMN 1: Name & Email */}
                                    <td className="whitespace-normal break-all min-w-[200px] align-middle">
                                        {/* INLINE NAME EDITING LOGIC */}
                                        {editingNameId === user.id ? (
                                            <div className="flex flex-col gap-2">
                                                <input 
                                                    type="text" 
                                                    className="input input-sm input-bordered w-full bg-white"
                                                    value={tempName}
                                                    onChange={(e) => setTempName(e.target.value)}
                                                    autoFocus
                                                    onKeyDown={(e) => e.key === 'Enter' && saveName(user)}
                                                />
                                                <div className="flex gap-2">
                                                    <button onClick={() => saveName(user)} className="btn btn-xs btn-success text-white">Save</button>
                                                    <button onClick={() => setEditingNameId(null)} className="btn btn-xs btn-ghost text-red-500">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-2 group">
                                                <div className="w-full">
                                                    <div className="font-bold leading-tight text-base">{user.fullName || "Unregistered"}</div>
                                                    <div className="text-xs text-gray-500 mt-1 break-all">{user.email}</div>
                                                </div>
                                                {canManage(user) && (
                                                    <button 
                                                        onClick={() => startEditName(user)}
                                                        className="opacity-0 group-hover:opacity-100 btn btn-xs btn-ghost text-blue-400 transition-opacity mt-0.5"
                                                        title="Rename User"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* COLUMN 2: Status Badge */}
                                    <td className="text-center align-middle">
                                        {user.status === 'REGISTERED' 
                                            ? <span className="badge badge-success text-white badge-sm whitespace-nowrap">Active</span>
                                            : user.status === 'INACTIVE'
                                            ? <span className="badge badge-error text-white badge-sm whitespace-nowrap">Inactive</span>
                                            : <span className="badge badge-warning badge-sm whitespace-nowrap">Pending</span>
                                        }
                                    </td>

                                    {/* COLUMN 3: Role Dropdown (Or Text) */}
                                    <td className="align-middle">
                                        {/* Logic: Only Super Admin can change roles. Even Admins just see text. 
                                            Self always sees text. */}
                                        {userRole === 'SUPER_ADMIN' && !isSelf ? (
                                            <select 
                                                className="select select-bordered select-sm w-full max-w-[180px] font-medium text-slate-700 bg-white"
                                                value={user.role}
                                                onChange={(e) => changeRole(user, e.target.value)}
                                            >
                                                <option value="EMPLOYEE">Employee</option>
                                                <option value="ADMIN">Admin</option>
                                                <option value="SUPER_ADMIN">Super Admin</option>
                                            </select>
                                        ) : (
                                            <div className="font-medium text-slate-600 px-1">
                                                {user.role === 'SUPER_ADMIN' ? 'Super Admin' : 
                                                 user.role === 'ADMIN' ? 'Admin' : 'Employee'}
                                                {isSelf && <span className="text-xs text-gray-400 ml-1">(You)</span>}
                                            </div>
                                        )}
                                    </td>

                                    {/* COLUMN 4: Action Buttons */}
                                    <td className="text-center align-middle">
                                        {processingUsers.includes(user.id) ? (
                                            <span className="loading loading-spinner loading-sm text-gray-400"></span>
                                        ) : (
                                            /* Hide buttons for Self */
                                            !isSelf && canManage(user) && (
                                                <div className="flex justify-center items-center gap-2">
                                                    {user.status !== 'PENDING' && canToggleStatus(user) && (
                                                        <button 
                                                            onClick={() => toggleStatus(user)}
                                                            className={`btn btn-square btn-sm btn-ghost ${user.status === 'INACTIVE' ? 'text-success bg-green-50' : 'text-warning'}`}
                                                            title={user.status === 'INACTIVE' ? "Reactivate User" : "Deactivate User"}
                                                        >
                                                            {user.status === 'INACTIVE' ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                                                                </svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}
                                                    
                                                    <button 
                                                        onClick={() => revokeAccess(user)}
                                                        className="btn btn-square btn-sm btn-ghost text-red-500 hover:bg-red-50"
                                                        title="Revoke Access (Delete)"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
            </div>
        </div>
        </div>
      </main>
    </div>
  );
}
