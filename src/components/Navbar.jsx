import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { currentUser, userRole, logout } = useAuth();

  return (
    <div className="navbar bg-white border-b border-gray-200 px-4 mb-6">
      <div className="flex-1">
        <div className="flex flex-col items-start">
           <div className="flex items-baseline gap-4">
             {/* Use Link instead of a tag */}
             <Link to="/" className="btn btn-ghost normal-case text-xl text-blue-700 font-bold hover:bg-transparent pl-0">
               BookstoreIMS
             </Link>
             {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
               <Link to="/staff" className="text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                 Manage Staff
               </Link>
             )}
           </div>
           <span className="text-xs text-gray-500 -mt-1">Finance Dept. Control</span>
        </div>
      </div>
      
      <div className="flex-none gap-4">
        {/* User Profile Section */}
        <div className="flex items-center gap-4">
           <div className="text-right hidden sm:block">
             <div className="text-sm font-bold text-gray-700">
                {currentUser?.fullName || currentUser?.email}
             </div>
             <div className="text-xs text-gray-500 badge badge-ghost badge-sm">
                {userRole}
             </div>
           </div>
           
           <button onClick={logout} className="btn btn-xs btn-outline btn-error">
             Logout
           </button>
        </div>
      </div>
    </div>
  );
}