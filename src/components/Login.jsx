import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
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

  // Redirect if already logged in
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

  // If user is logged in, show spinner instead of form
  if (currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-200">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-gray-500 animate-pulse">Redirecting to Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-shell">
        {/* LEFT PANEL */}
        <div className="left-panel">
          <svg 
            className="left-pattern" 
            viewBox="0 0 280 540" 
            xmlns="http://www.w3.org/2000/svg" 
            preserveAspectRatio="xMidYMax slice"
          >
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
          <div className="left-content">
            <div className="system-badge">University Bookstore System</div>
            <div className="crest-ring">
              <div className="crest-inner">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 8h20M4 14h14M4 20h8" stroke="#C8A96E" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M22 12 l3 3 l-3 3" stroke="#C8A96E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
            <div className="system-name">Inventory &amp;<br/>Issuance Portal</div>
            <div className="divider-left"></div>
            <div className="system-sub">Textbook issuances, returns,<br/>and stock management</div>
            <div className="divider-left" style={{marginTop: '1.5rem'}}></div>
            <div className="access-note">Authorized staff only</div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <div className="tab-row">
            <div className="tab active">Staff Login</div>
            <Link to="/register" className="tab">New Registration</Link>
          </div>

          <div className="form-title">Welcome back</div>
          <div className="form-desc">Sign in with your assigned staff credentials to continue.</div>
          
          {error && <div className="bg-red-50 text-red-600 p-2 rounded text-[11px] mb-4 border border-red-100">{error}</div>}

          <form onSubmit={handleSubmit} className="flex flex-col flex-1">
            <div className="mb-4">
              <label className="field-label">Staff email address</label>
              <input 
                type="email" required className="auth-input" 
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
              <Link to="/forgot-password" size="sm" className="text-[11.5px] text-[#C8A96E] font-medium hover:underline">
                Forgot password?
              </Link>
            </div>

            <div className={`flex justify-center mb-4 min-h-[65px] ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              <Turnstile 
                ref={turnstileRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} 
                onSuccess={(token) => { setCaptchaToken(token); setError(""); }}
                options={{ theme: 'light', size: 'normal' }}
              />
            </div>

            <button type="submit" disabled={loading || !captchaToken} className="primary-btn">
              {loading ? "Verifying..." : "Sign in to Portal"}
            </button>
            
            <div className="text-center text-[12px] text-[#64748b]">
              Don't have an account? <Link to="/register" className="text-[#C8A96E] font-medium">Register with invite</Link>
            </div>

            <div className="mt-auto pt-4 border-t border-[#e2e8f0] flex items-center justify-between">
              <div className="text-[10px] text-[#94a3b8] tracking-widest uppercase">Finance &amp; Records Dept.</div>
              <div className="text-[10px] text-[#94a3b8] flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF82] mr-1.5"></span>
                System online
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}