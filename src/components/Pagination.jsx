import { useState, useEffect } from "react";

export default function Pagination({ 
  totalCount, 
  itemsPerPage, 
  currentPage, 
  onPageChange, 
  loading 
}) {
  const [jumpPage, setJumpPage] = useState(currentPage);
  const maxPages = Math.ceil(totalCount / itemsPerPage) || 1;

  // Sync internal input state with external page prop
  useEffect(() => {
    setJumpPage(currentPage);
  }, [currentPage]);

  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < maxPages) onPageChange(currentPage + 1);
  };

  const handleJump = (e) => {
    if (e.key === 'Enter') {
      let p = parseInt(jumpPage);
      if (!isNaN(p) && p > 0 && p <= maxPages) {
        onPageChange(p);
      } else {
        setJumpPage(currentPage);
      }
    }
  };

  return (
    <div className="p-4 border-t flex flex-col sm:flex-row justify-between items-center bg-white rounded-b-xl gap-4">
      {/* Left Side: Status Text */}
      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
        {totalCount > 0 
          ? `${totalCount} Records Found`
          : "No records found"}
      </div>

      {/* Right Side: Controls */}
      <div className="flex items-center gap-2">
        <button 
          className="btn btn-sm btn-ghost text-slate-500 disabled:text-slate-200"
          disabled={currentPage === 1 || loading}
          onClick={handlePrev}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </button>
        
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page</span>
          <input 
            type="number" 
            min="1" 
            max={maxPages}
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            onKeyDown={handleJump}
            className="w-8 bg-transparent text-center font-bold text-xs text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs font-bold text-slate-400">/ {maxPages}</span>
        </div>

        <button 
          className="btn btn-sm btn-ghost text-slate-500 disabled:text-slate-200"
          disabled={currentPage >= maxPages || loading}
          onClick={handleNext}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}