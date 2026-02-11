import React, { useEffect } from 'react';

export default function Toast({ message, subMessage, type = "success", onClose, duration = 4000 }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const configs = {
    success: {
      bg: "bg-emerald-600",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />,
      title: "Action Successful"
    },
    delete: {
      bg: "bg-slate-800",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
      title: "Record Deleted"
    },
    error: {
      bg: "bg-rose-600",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />,
      title: "Error Occurred"
    }
  };

  const config = configs[type] || configs.success;

  return (
    <div className="toast toast-end toast-bottom z-[1000] p-4">
      <div className={`alert shadow-2xl border-none ${config.bg} text-white min-w-[300px] flex justify-between group animate-in fade-in slide-in-from-bottom-5 duration-300`}>
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-1.5 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {config.icon}
            </svg>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold text-sm tracking-tight">{message || config.title}</span>
            {subMessage && <span className="text-xs opacity-90">{subMessage}</span>}
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-xs btn-circle text-white opacity-50 hover:opacity-100 text-lg">×</button>
      </div>
    </div>
  );
}