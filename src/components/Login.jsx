import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { PasswordInput } from "./PasswordInput";
import { Turnstile } from "@marsidev/react-turnstile";

export default function Login() {
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef(null);

  useEffect(() => {
    if (currentUser) navigate("/");
  }, [currentUser, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password, captchaToken);
    } catch (err) {
      setError("Failed to sign in. Check email/password.");
      turnstileRef.current?.reset();
      setCaptchaToken("");
      setLoading(false); 
    }
  }

  if (currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9]">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-gray-500 animate-pulse">Redirecting to Dashboard...</p>
        </div>
      </div>
    );
  }

  const inputStyle = "w-full h-9 bg-[#f8fafc] border border-[#cbd5e1] rounded-lg px-3 text-[13px] text-[#1e293b] transition-all outline-none focus:border-[#1B2D4F] focus:bg-white focus:ring-2 focus:ring-[#1B2D4F]/5 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f1f5f9] font-['DM_Sans',sans-serif] text-[#1e293b]">
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

          <div className="font-['Playfair_Display',serif] text-[22px] font-medium text-[#1e293b] mb-1">Welcome back</div>
          <div className="text-[12px] text-[#64748b] mb-6">Sign in with your assigned staff credentials to continue.</div>
          
          {error && <div className="bg-red-50 text-red-600 p-2 rounded text-[11px] mb-4 border border-red-100">{error}</div>}

          <form onSubmit={handleSubmit} className="flex flex-col flex-1">
            <div className="mb-4">
              <label className="text-[11.5px] font-medium text-[#64748b] tracking-wide mb-1.5 block">Staff email address</label>
              <input 
                type="email" required className={inputStyle} 
                value={email} onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            
            <div className="mb-2 relative">
              <PasswordInput 
                label="Password"
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="text-right mb-4">
              <Link 
                to="/forgot-password" 
                className={`text-[11.5px] text-[#C8A96E] font-medium hover:underline ${loading ? "pointer-events-none opacity-50" : ""}`}
              >
                Forgot password?
              </Link>
            </div>

            <div className={`transform scale-[0.85] md:scale-100 flex justify-center mb-4 min-h-[65px] ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              <Turnstile 
                ref={turnstileRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} 
                onSuccess={(token) => { setCaptchaToken(token); setError(""); }}
                onError={() => { setCaptchaToken(""); setError("Security verification failed. Please refresh or try again."); }}
                onExpire={() => { setCaptchaToken(""); setError("Security verification expired. Please check the box again."); }}
                options={{ theme: 'light', size: 'normal' }}
              />
            </div>

            <button type="submit" disabled={loading || !captchaToken} className="h-10 bg-[#1B2D4F] rounded-lg flex items-center justify-center text-[13.5px] font-medium text-white cursor-pointer transition-all w-full mb-4 tracking-wide hover:bg-[#243d6a] disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Verifying..." : "Sign in"}
            </button>

            <div className="text-center text-[12px] text-[#64748b]">
              Don't have an account? <Link to="/register" className={`text-[#C8A96E] font-medium hover:underline ${loading ? "pointer-events-none opacity-50" : ""}`}>Register with invite</Link>
            </div>

            <div className="mt-auto pt-4 border-t border-[#e2e8f0] flex items-center justify-between">
              <div className="text-[10px] text-[#94a3b8] tracking-widest uppercase">Finance &amp; Records Dept.</div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}