import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import AdminInvite from "../components/AdminInvite";

export default function StaffPage() {
  const { userRole, currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  
  // NEW: State for Inline Renaming
  const [editingNameId, setEditingNameId] = useState(null);
  const [tempName, setTempName] = useState("");

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

  const toggleStatus = async (user) => {
    if (!canToggleStatus(user)) return alert("You do not have permission to change this user's status.");
    if (user.id === currentUser.id) return alert("You cannot deactivate your own account.");

    const newStatus = user.status === 'INACTIVE' ? 'REGISTERED' : 'INACTIVE';
    const action = newStatus === 'INACTIVE' ? 'DEACTIVATE' : 'REACTIVATE';

    if (confirm(`Are you sure you want to ${action} access for ${user.fullName}?`)) {
        try {
            const { error } = await supabase
                .from('authorized_users')
                .update({ status: newStatus })
                .eq('id', user.id);

            if (error) throw error;

            setRefreshTrigger(prev => prev + 1);
            
            // Broadcast immediate kick/update
            await supabase.channel('app_updates').send({
                type: 'broadcast',
                event: 'staff_update',
                payload: { targetId: user.id, status: newStatus } 
            });

        } catch (err) {
            alert(`Failed to ${action.toLowerCase()} user: ` + err.message);
        }
    }
  };

  const revokeAccess = async (user) => {
    if (!canManage(user)) return alert("You do not have permission to delete this user.");
    
    if (confirm(`Are you sure you want to REVOKE access for ${user.fullName}?`)) {
        try {
            // CALL THE SECURE SQL FUNCTION
            const { error } = await supabase.rpc('delete_staff_account', { 
                target_record_id: user.id 
            });

            if (error) throw error;

            // 1. Refresh Local State
            setRefreshTrigger(prev => prev + 1); 

            // 2. Broadcast to other tabs
            await supabase.channel('app_updates').send({ 
                type: 'broadcast',
                event: 'staff_update',
                payload: {} 
            });

        } catch (err) {
            console.error("Revoke failed:", err);
            alert("Failed to revoke access: " + err.message);
        }
    }
  };

  if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) return <div className="p-10 text-center text-error">Access Denied</div>;


  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4 max-w-5xl">
        <div className="flex flex-col md:flex-row gap-8 items-start">
            
            {/* LEFT: Invite Form */}
            <div className="w-full md:w-1/3 sticky top-6">
                <AdminInvite onSuccess={() => setRefreshTrigger(prev => prev + 1)} />
                <div className="mt-4 p-4 text-xs text-gray-500 bg-white rounded-lg shadow border">
                    <p className="font-bold">Privilege Levels:</p>
                    <ul className="list-disc pl-4 mt-2 space-y-1">
                        <li><strong>Super Admin:</strong> Full control.</li>
                        <li><strong>Admin:</strong> Can manage Employees only.</li>
                        <li><strong>Employee:</strong> No access to this page.</li>
                    </ul>
                </div>
            </div>

            {/* RIGHT: User List */}
            <div className="w-full md:w-2/3 card bg-base-100 shadow-xl">
                <div className="p-4 border-b">
                    <h2 className="card-title text-gray-700">Authorized Personnel ({staff.length})</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="table w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th>Name / Email</th>
                                <th>Status</th>
                                <th>Role</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="4" className="text-center py-4">Loading...</td></tr>
                            ) : staff.map((user) => (
                                <tr key={user.id} className="hover">
                                    <td>
                                        {/* INLINE NAME EDITING LOGIC */}
                                        {editingNameId === user.id ? (
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="text" 
                                                    className="input input-xs input-bordered w-full max-w-[150px] bg-white"
                                                    value={tempName}
                                                    onChange={(e) => setTempName(e.target.value)}
                                                    autoFocus
                                                    onKeyDown={(e) => e.key === 'Enter' && saveName(user)}
                                                />
                                                <button onClick={() => saveName(user)} className="btn btn-xs btn-success text-white">✓</button>
                                                <button onClick={() => setEditingNameId(null)} className="btn btn-xs btn-ghost text-red-500">✕</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 group">
                                                <div>
                                                    <div className="font-bold">{user.fullName || "Unregistered"}</div>
                                                    <div className="text-xs text-gray-500">{user.email}</div>
                                                </div>
                                                {/* Edit Pencil - Only if allowed */}
                                                {canManage(user) && (
                                                    <button 
                                                        onClick={() => startEditName(user)}
                                                        className="opacity-0 group-hover:opacity-100 btn btn-xs btn-ghost text-blue-400 transition-opacity"
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
                                    <td>
                                        {user.status === 'REGISTERED' 
                                            ? <span className="badge badge-success badge-sm text-white">Active</span>
                                            : user.status === 'INACTIVE'
                                            ? <span className="badge badge-error badge-sm text-white">Inactive</span>
                                            : <span className="badge badge-warning badge-sm">Pending</span>
                                        }
                                    </td>
                                    <td>
                                        <span className={`badge badge-sm ${
                                            user.role === 'SUPER_ADMIN' ? 'badge-primary' : 
                                            user.role === 'ADMIN' ? 'badge-secondary' : 'badge-ghost'
                                        }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        {canManage(user) && (
                                            <div className="flex justify-end gap-2 items-center">
                                                {/* Only SUPER_ADMIN sees the role dropdown */}
                                                {userRole === 'SUPER_ADMIN' && (
                                                    <select 
                                                        className="select select-bordered select-xs w-32 font-normal"
                                                        value={user.role}
                                                        onChange={(e) => changeRole(user, e.target.value)}
                                                    >
                                                        <option value="EMPLOYEE">Employee</option>
                                                        <option value="ADMIN">Admin</option>
                                                        <option value="SUPER_ADMIN">Super Admin</option>
                                                    </select>
                                                )}

                                                {/* Status Toggle Button - Now available to both SUPER_ADMIN and ADMIN (for employees) */}
                                                {user.status !== 'PENDING' && canToggleStatus(user) && (
                                                    <button 
                                                        onClick={() => toggleStatus(user)}
                                                        className={`btn btn-square btn-xs btn-outline ${user.status === 'INACTIVE' ? 'btn-success' : 'btn-warning'}`}
                                                        title={user.status === 'INACTIVE' ? "Reactivate User" : "Deactivate User"}
                                                    >
                                                        {user.status === 'INACTIVE' ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                                                            </svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={() => revokeAccess(user)}
                                                    className="btn btn-square btn-xs btn-outline btn-error"
                                                    title="Revoke Access (Delete)"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
