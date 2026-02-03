import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";

export default function Navbar() {
  const { currentUser, userRole, logout } = useAuth();

  return (
    <div className="navbar bg-white border-b border-gray-200 px-4 mb-6">
      <div className="flex-1">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-4">
             {/* Use Link instead of a tag */}
             <Link to="/" className="btn btn-ghost px-0 hover:bg-transparent flex items-center gap-3">
               <Logo className="w-12 h-12" />
               <div className="flex flex-col items-start leading-none">
                 <span className="text-xl text-blue-900 font-extrabold tracking-tight">BookstoreIMS</span>
                 <span className="text-[10px] uppercase tracking-widest text-blue-500 font-semibold">Inventory System</span>
               </div>
             </Link>

             {/* Navigation Divider (Vertical Line) */}
             <div className="h-8 w-px bg-gray-300 mx-2 hidden md:block"></div>

             <Link to="/students" className="text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                 Students
             </Link>
             <Link to="/transactions" className="text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                 Transactions
             </Link>
             <Link to="/suppliers" className="text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                 Suppliers
             </Link>
             {['ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
               <Link to="/staff" className="text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                 Manage Staff
               </Link>
             )}
           </div>
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