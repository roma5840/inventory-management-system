export default function Navbar() {
  return (
    <div className="navbar bg-white border-b border-gray-200 px-4 mb-6">
      <div className="flex-1">
        <div className="flex flex-col">
           <a className="btn btn-ghost normal-case text-xl text-blue-700 font-bold hover:bg-transparent pl-0">
             BookstoreIMS
           </a>
           <span className="text-xs text-gray-500 -mt-1">Finance Dept. Control</span>
        </div>
      </div>
      
      <div className="flex-none gap-4">
        {/* User Profile Section */}
        <div className="flex items-center gap-2">
           <div className="text-right hidden sm:block">
             <div className="text-sm font-bold text-gray-700">Administrator</div>
             <div className="text-xs text-gray-500">Finance Access</div>
           </div>
           
           <div className="avatar placeholder">
            <div className="bg-blue-700 text-white rounded-full w-10">
              {/* Simple User Icon SVG */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}