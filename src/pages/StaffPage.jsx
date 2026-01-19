import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import AdminInvite from "../components/AdminInvite";

export default function StaffPage() {
  const { userRole, currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to Authorized Users
  useEffect(() => {
    const fetchStaff = async () => {
        // Alias full_name to fullName
        const { data } = await supabase
            .from('authorized_users')
            .select('*, fullName:full_name');
        if(data) setStaff(data);
        setLoading(false);
    }
    
    fetchStaff();

    const channel = supabase.channel('staff_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'authorized_users' }, () => fetchStaff())
        .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const canManage = (targetUser) => {
    if (userRole === 'SUPER_ADMIN') return targetUser.auth_uid !== currentUser.id; // Super can edit anyone but self
    if (userRole === 'ADMIN') return targetUser.role === 'EMPLOYEE'; // Admin can only edit Employees
    return false;
  };


  const toggleRole = async (user) => {
    if (!canManage(user)) return alert("You do not have permission to modify this user.");
    
    // Rotate roles based on current level
    let newRole = "EMPLOYEE";
    if (user.role === "EMPLOYEE") newRole = "ADMIN";
    // Only Super Admin can make others Super Admin (optional, keeping simple for now)
    
    if (confirm(`Change ${user.fullName}'s role to ${newRole}?`)) {
        const { error } = await supabase.from('authorized_users').update({ role: newRole }).eq('id', user.id);
        if (error) alert(error.message);
    }
  };

  const revokeAccess = async (user) => {
    if (!canManage(user)) return alert("You do not have permission to delete this user.");
    
    if (confirm(`Are you sure you want to REVOKE access for ${user.fullName}?`)) {
        const { error } = await supabase.from('authorized_users').delete().eq('id', user.id);
        if (error) alert(error.message);
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
                <AdminInvite />
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
                                        <div className="font-bold">{user.fullName || "Unregistered"}</div>
                                        <div className="text-xs text-gray-500">{user.email}</div>
                                    </td>
                                    <td>
                                        {user.status === 'REGISTERED' 
                                            ? <span className="badge badge-success badge-sm text-white">Active</span>
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
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => toggleRole(user)}
                                                    className="btn btn-xs btn-ghost border-gray-300"
                                                >
                                                    Toggle Role
                                                </button>
                                                <button 
                                                    onClick={() => revokeAccess(user)}
                                                    className="btn btn-square btn-xs btn-outline btn-error"
                                                    title="Revoke Access"
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
