import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import AdminInvite from "../components/AdminInvite";

export default function StaffPage() {
  const { userRole, currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to Authorized Users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "authorized_users"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStaff(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const toggleRole = async (user) => {
    if (user.uid === currentUser.uid) return alert("You cannot change your own role.");
    const newRole = user.role === "ADMIN" ? "EMPLOYEE" : "ADMIN";
    
    if (confirm(`Change ${user.fullName}'s role to ${newRole}?`)) {
        await updateDoc(doc(db, "authorized_users", user.id), { role: newRole });
    }
  };

  const revokeAccess = async (user) => {
    if (user.uid === currentUser.uid) return alert("You cannot delete yourself.");
    
    if (confirm(`Are you sure you want to REVOKE access for ${user.fullName}? They will no longer be able to login.`)) {
        await deleteDoc(doc(db, "authorized_users", user.id));
    }
  };

  if (userRole !== "ADMIN") return <div className="p-10 text-center text-error">Access Denied</div>;

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4 max-w-5xl">
        <div className="flex flex-col md:flex-row gap-8 items-start">
            
            {/* LEFT: Invite Form */}
            <div className="w-full md:w-1/3 sticky top-6">
                <AdminInvite />
                <div className="mt-4 p-4 text-xs text-gray-500 bg-white rounded-lg shadow border">
                    <p className="font-bold">Staff Policy:</p>
                    <ul className="list-disc pl-4 mt-2 space-y-1">
                        <li><strong>Pending:</strong> Invited via email, hasn't registered yet.</li>
                        <li><strong>Registered:</strong> Has active access to the system.</li>
                        <li><strong>Revoke:</strong> Permanently removes access immediately.</li>
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
                                        <div className="font-bold">{user.fullName}</div>
                                        <div className="text-xs text-gray-500">{user.email}</div>
                                    </td>
                                    <td>
                                        {user.status === 'REGISTERED' 
                                            ? <span className="badge badge-success badge-sm text-white">Active</span>
                                            : <span className="badge badge-warning badge-sm">Pending</span>
                                        }
                                    </td>
                                    <td>
                                        <button 
                                            onClick={() => toggleRole(user)}
                                            className={`btn btn-xs no-animation ${user.role === 'ADMIN' ? 'btn-primary' : 'btn-ghost border-gray-300'}`}
                                            disabled={user.uid === currentUser.uid}
                                        >
                                            {user.role}
                                        </button>
                                    </td>
                                    <td className="text-right">
                                        <button 
                                            onClick={() => revokeAccess(user)}
                                            className="btn btn-square btn-xs btn-outline btn-error"
                                            disabled={user.uid === currentUser.uid}
                                            title="Revoke Access"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                        </button>
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