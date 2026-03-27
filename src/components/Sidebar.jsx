import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { currentUser, userRole, logout } = useAuth();
  const location = useLocation();
  const menuRef = useRef(null);
  
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isUserMenuOpen) return;

    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isUserMenuOpen]);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const newState = !prev;
      localStorage.setItem("sidebar_collapsed", newState);
      return newState;
    });
  };

  const menuGroups = [
    {
      title: "Operations",
      items: [
        { label: "Dashboard", path: "/", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" },
        { label: "Inventory", path: "/inventory", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
        { label: "Transactions", path: "/transactions", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
      ]
    },
    {
      title: "Directory",
      items: [
        { label: "Students", path: "/students", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
        { label: "Suppliers", path: "/suppliers", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
      ]
    }
  ];

  if (['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
    const adminItems = [
      { label: "Manage Staff", path: "/staff", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" }
    ];
    
    if (userRole === 'SUPER_ADMIN') {
      adminItems.push({ label: "System Logs", path: "/system-logs", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" });
    }

    menuGroups.push({ title: "System", items: adminItems });
  }

  return (
    <aside className={`${isCollapsed ? "w-[60px]" : "w-[240px]"} bg-[#121E36] h-screen sticky top-0 flex flex-col shrink-0 transition-all duration-300 ease-in-out font-['DM_Sans',sans-serif]`}>
      
      {/* HEADER */}
      {!isCollapsed ? (
        <div className="relative p-[24px_20px_20px] border-b border-white/5 shrink-0">
          <div className="text-[10px] tracking-[0.2em] uppercase text-slate-400 font-bold mb-1.5">UPANG Bookstore</div>
          <div className="font-['Playfair_Display',serif] text-[17px] font-semibold text-white leading-[1.25]">Inventory &amp;<br/>Issuance Portal</div>
          
          <button 
            onClick={toggleSidebar}
            className="absolute top-6 right-4 w-6 h-6 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 rounded transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
          </button>
        </div>
      ) : (
        <div className="pt-[20px] pb-4 flex flex-col items-center shrink-0">
          <div 
            onClick={toggleSidebar}
            className="w-[38px] h-[38px] rounded-[10px] bg-white/[0.08] flex items-center justify-center cursor-pointer text-slate-400 hover:bg-white/20 hover:text-white transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
          </div>
        </div>
      )}

      {/* NAV CONTENT */}
      <nav className={`flex-1 overflow-y-auto custom-scrollbar flex flex-col ${isCollapsed ? 'px-0 items-center' : 'p-[24px_12px] gap-[26px]'}`}>
        {menuGroups.map((group, idx) => (
          <div key={group.title} className={`flex flex-col ${isCollapsed ? 'items-center w-full mb-4' : 'gap-[4px]'}`}>
            
            {!isCollapsed && (
              <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-slate-500 px-2.5 mb-2">
                {group.title}
              </div>
            )}
            
            <div className={`flex flex-col gap-[2px] w-full ${isCollapsed ? 'items-center' : ''}`}>
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                
                if (isCollapsed) {
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={item.label}
                      className={`w-[40px] h-[40px] rounded-[10px] flex items-center justify-center transition-all ${
                        isActive 
                          ? "bg-[#C8A96E] text-[#1B2D4F] shadow-lg" 
                          : "text-slate-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? "2" : "1.5"}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-[12px] px-[12px] py-[10px] rounded-[10px] transition-all text-[13.5px] group ${
                      isActive 
                        ? "bg-white/10 text-white font-semibold relative" 
                        : "text-slate-300 hover:bg-white/[0.07] hover:text-white font-medium"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-[20%] h-[60%] w-[3px] bg-[#C8A96E] rounded-r-full shadow-[0_0_8px_rgba(200,169,110,0.5)]" />
                    )}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? "2" : "1.5"} className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#C8A96E]' : 'text-slate-500 group-hover:text-slate-300'}`}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {isCollapsed && idx < menuGroups.length - 1 && (
              <div className="w-8 h-px bg-white/10 my-3"></div>
            )}
          </div>
        ))}
      </nav>

      {/* FOOTER / PROFILE SECTION */}
      <div className="mt-auto relative p-[16px_12px]" ref={menuRef}>
        
        {/* User Popup Menu */}
        <div 
          className={`absolute bottom-[80px] ${isCollapsed ? "left-2 right-2" : "left-3 right-3"} bg-[#121E36] border border-[#C8A96E]/30 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 z-[100] ${
            isUserMenuOpen 
              ? "opacity-100 translate-y-0 scale-100 pointer-events-auto" 
              : "opacity-0 translate-y-2 scale-95 pointer-events-none"
          }`}
        >
          <div className="p-1 flex flex-col gap-0.5">
            <Link 
              to="/settings"
              onClick={() => setIsUserMenuOpen(false)}
              title={isCollapsed ? "Account Settings" : ""}
              className={`flex items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-all text-[12px] font-medium ${
                isCollapsed ? "justify-center py-3" : "gap-2.5 px-3 py-1.5"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>
              {!isCollapsed && <span>Account Settings</span>}
            </Link>
            <div className="h-px bg-white/5 mx-2 my-0.5"></div>
            <button 
              onClick={() => { setIsUserMenuOpen(false); logout(); }}
              title={isCollapsed ? "Sign Out" : ""}
              className={`flex items-center rounded-lg text-red-400/90 hover:bg-red-500/10 hover:text-red-400 transition-all text-[12px] font-bold ${
                isCollapsed ? "justify-center py-3" : "gap-2.5 px-3 py-1.5"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
              {!isCollapsed && <span>Sign Out</span>}
            </button>
          </div>
        </div>

        {/* Profile Trigger */}
        <button 
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={`w-full flex items-center rounded-xl transition-all border outline-none ${
            isCollapsed ? 'justify-center p-0 h-[38px] w-[38px] mx-auto' : 'gap-3 p-[10px] pr-3'
          } ${
            isUserMenuOpen 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.06]'
          }`}
        >
          <div className="w-[32px] h-[32px] rounded-full bg-[#C8A96E] flex items-center justify-center text-[12px] font-bold text-[#1B2D4F] shrink-0 shadow-md">
            {(currentUser?.fullName || currentUser?.email || "JD").slice(0, 2).toUpperCase()}
          </div>
          
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-bold text-white leading-tight truncate">
                  {currentUser?.fullName || "User Account"}
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                  {userRole?.replace('_', ' ') || 'Guest'}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-slate-500 transition-transform duration-300 ${isUserMenuOpen ? 'rotate-180' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
              </svg>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}