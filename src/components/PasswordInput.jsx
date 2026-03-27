import { useState } from "react";

export function PasswordInput({ value, onChange, label, bottomLabel, placeholder, required = true, className = "", disabled = false, ...props }) {
  const [showPassword, setShowPassword] = useState(false);
  const { className: inputClassName, ...inputProps } = props;

  return (
    <div className={`flex flex-col w-full ${className}`}>
      {label && <label className="text-[11.5px] font-medium text-[#64748b] tracking-wide mb-1.5 block">{label}</label>}
      
      <div className="relative w-full">
        <input
          {...inputProps}
          type={showPassword ? "text" : "password"}
          required={required}
          placeholder={placeholder}
          className={`w-full h-9 bg-[#f8fafc] border border-[#cbd5e1] rounded-lg px-3 pr-10 text-[13px] text-[#1e293b] transition-all outline-none focus:border-[#1B2D4F] focus:bg-white focus:ring-2 focus:ring-[#1B2D4F]/5 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed ${inputClassName || ""}`}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-[#94a3b8] hover:text-[#64748b] transition-colors disabled:opacity-50"
          onClick={() => setShowPassword(!showPassword)}
          tabIndex="-1"
          disabled={disabled}
        >
          {showPassword ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          )}
        </button>
      </div>

      {bottomLabel && <div className="mt-1">{bottomLabel}</div>}
    </div>
  );
}