import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";
import { PasswordInput } from "./PasswordInput";

export default function UpdatePassword() {
  const navigate = useNavigate();
  const { clearRecoveryMode } = useAuth();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Ensure user is authenticated (via the magic link) before showing form
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');

    if (code) {
      // First arrival — strip code from URL immediately so refresh/StrictMode never re-attempts exchange
      window.history.replaceState({}, '', '/update-password');
      
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error("Code exchange failed:", error.message);
          clearRecoveryMode();
          navigate("/login");
        }
      });
    } else {
      // No code in URL — session must already exist (refresh/new-tab)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          clearRecoveryMode();
          navigate("/login");
        }
      });
    }
  }, [navigate, clearRecoveryMode]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Please request a new link.");

      const { error: updateError } = await supabase.auth.updateUser({ password });
      
      if (updateError) {
        if (updateError.message.includes("Password should contain")) {
          throw new Error("Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.");
        }
        throw updateError;
      }

      // Automatically removes lock from memory, localStorage, and forces all open tabs securely to Dashboard!
      clearRecoveryMode();
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Password Update Error:", err.message);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
      <div 
        className="min-h-screen flex items-center justify-center p-6 bg-[#f0ede8] font-['DM_Sans',sans-serif] text-[#1e293b]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(27,45,79,0.12) 1px, transparent 1px)',
          backgroundSize: '16px 16px'
        }}
      >
      <div className="flex w-full max-w-[780px] min-h-[540px] rounded-2xl overflow-hidden bg-white border-[0.5px] border-[#e2e8f0] shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        
        {/* LEFT PANEL */}
        <div className="w-[280px] shrink-0 bg-[#1B2D4F] flex flex-col items-center justify-center p-8 relative overflow-hidden hidden md:flex">
          <svg className="absolute inset-0 opacity-[0.07] w-full h-full pointer-events-none" viewBox="0 0 280 540" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice">
            <g fill="white">
              <rect x="20" y="420" width="14" height="60" rx="2"/><rect x="38" y="430" width="10" height="50" rx="2"/>
              <rect x="52" y="415" width="16" height="65" rx="2"/><rect x="72" y="425" width="12" height="55" rx="2"/>
              <rect x="88" y="410" width="18" height="70" rx="2"/><rect x="110" y="422" width="13" height="58" rx="2"/>
              <rect x="127" y="418" width="15" height="62" rx="2"/><rect x="146" y="428" width="11" height="52" rx="2"/>
              <rect x="161" y="412" width="17" height="68" rx="2"/><rect x="182" y="424" width="12" height="56" rx="2"/>
              <rect x="198" y="416" width="14" height="64" rx="2"/><rect x="216" y="420" width="16" height="60" rx="2"/>
              <rect x="236" y="430" width="10" height="50" rx="2"/><rect x="250" y="414" width="14" height="66" rx="2"/>
              <rect x="20" y="60" width="240" height="1" rx="1"/><rect x="20" y="100" width="180" height="1" rx="1"/>
              <rect x="20" y="140" width="200" height="1" rx="1"/><rect x="20" y="180" width="160" height="1" rx="1"/>
              <circle cx="240" cy="80" r="20" fill="none" stroke="white" strokeWidth="1"/>
              <circle cx="240" cy="80" r="12" fill="none" stroke="white" strokeWidth="1"/>
            </g>
          </svg>
          <div className="relative z-10 text-center text-white flex flex-col items-center h-full justify-center">
            <div className="text-[10px] tracking-[0.2em] uppercase text-[#C8A96E] font-medium mb-6">UPANG Bookstore Inventory Management System</div>
            <div className="w-20 h-20 rounded-full border-[1.5px] border-[#C8A96E]/40 flex items-center justify-center mx-auto mb-5">
              <div className="w-[60px] h-[60px] rounded-full border border-[#C8A96E]/60 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 8h20M4 14h14M4 20h8" stroke="#C8A96E" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M22 12 l3 3 l-3 3" stroke="#C8A96E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div className="font-['Playfair_Display',serif] text-[17px] font-semibold text-[#F5EFDF] leading-tight mb-2">Inventory &amp;<br/>Issuance Portal</div>
            <div className="w-8 h-px bg-[#C8A96E]/40 my-5 mx-auto"></div>
            <div className="text-[11px] text-white/45 tracking-wider leading-relaxed">Item issuances, returns,<br/>and stock management</div>
            <div className="w-8 h-px bg-[#C8A96E]/40 mt-6 mb-5 mx-auto"></div>
            <div className="text-[10px] text-white/30 tracking-widest uppercase">Authorized staff only</div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 p-8 md:p-10 flex flex-col">
          <div className="font-['Playfair_Display',serif] text-[22px] font-medium text-[#1e293b] mb-1">Set New Password</div>
          <div className="text-[12px] text-[#64748b] mb-6">Create a secure new password for your staff account.</div>
          
          {error && <div className="bg-red-50 text-red-600 p-2 rounded text-[11px] mb-4 border border-red-100">{error}</div>}

          <form onSubmit={handleUpdate} className="flex flex-col flex-1">
            <div className="mb-6 relative">
              <PasswordInput 
                label="New Password"
                placeholder="Enter new password"
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" disabled={loading} className="h-10 bg-[#1B2D4F] rounded-lg flex items-center justify-center text-[13.5px] font-medium text-white cursor-pointer transition-all w-full mb-4 tracking-wide hover:bg-[#243d6a] disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Updating..." : "Update Password"}
            </button>
            
            <div className="mt-auto pt-4 border-t border-[#e2e8f0] flex items-center justify-between">
              <div className="text-[10px] text-[#94a3b8] tracking-widest uppercase">Finance &amp; Records Dept.</div>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}