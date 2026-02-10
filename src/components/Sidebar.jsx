import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";

export default function Sidebar() {
  const { currentUser, userRole, logout } = useAuth();
  const location = useLocation();
  
  // Persist state in localStorage so it doesn't reset on page navigation
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const newState = !prev;
      localStorage.setItem("sidebar_collapsed", newState);
      return newState;
    });
  };

  const menuItems = [
    { label: "Dashboard", path: "/", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" },
    { label: "Inventory", path: "/inventory", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
    { label: "Students", path: "/students", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
    { label: "Transactions", path: "/transactions", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
    { label: "Suppliers", path: "/suppliers", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  ];

  if (['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
    menuItems.push({ label: "Manage Staff", path: "/staff", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" });
  }

  return (
    <aside className={`${isCollapsed ? "w-20" : "w-64"} bg-slate-900 h-screen sticky top-0 flex flex-col border-r border-slate-800 text-slate-300 transition-all duration-300 ease-in-out`}>
      <div className={`p-4 flex items-center ${isCollapsed ? "justify-center" : "justify-between"} border-b border-slate-800/50 min-h-[81px]`}>
        {!isCollapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <Logo className="w-8 h-8 brightness-200 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white tracking-tight leading-none truncate">BookstoreIMS</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">Finance Portal</span>
            </div>
          </div>
        )}
        <button 
          onClick={toggleSidebar}
          className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 transition-transform duration-500 ${isCollapsed ? "rotate-180" : ""}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            title={isCollapsed ? item.label : ""}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === item.path 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                : "hover:bg-slate-800 hover:text-white"
            } ${isCollapsed ? "justify-center px-0" : ""}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 mt-auto">
        {!isCollapsed && (
          <div className="bg-slate-800/50 rounded-xl p-3 mb-4 overflow-hidden text-ellipsis">
            <div className="text-xs font-bold text-white truncate">{currentUser?.fullName || currentUser?.email}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-tighter mt-1">{userRole.replace('_', ' ')}</div>
          </div>
        )}
        <button 
          onClick={logout} 
          className={`btn btn-sm btn-outline btn-block border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white hover:border-slate-600 normal-case flex items-center justify-center gap-2 ${isCollapsed ? "border-none hover:bg-red-500/10 hover:text-red-500" : ""}`}
          title={isCollapsed ? "Sign Out" : ""}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}