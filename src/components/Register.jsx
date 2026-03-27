import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { PasswordInput } from "./PasswordInput";
import { Turnstile } from "@marsidev/react-turnstile";

export default function Register() {
  const { currentUser } = useAuth(); 
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "", confirmPass: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef(null);

  useEffect(() => {
    if (currentUser) navigate("/");
  }, [currentUser, navigate]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { email, password, confirmPass } = formData;
    const cleanEmail = email.trim().toLowerCase();

    if (password !== confirmPass) {
      setError("Passwords do not match.");
      turnstileRef.current?.reset();
      setCaptchaToken("");
      setLoading(false);
      return;
    }

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: { captchaToken }
      });

      if (signUpError) {
        // Supabase masks custom trigger exceptions as "Database error saving new user"
        if (signUpError.message.includes('Database error saving new user') || signUpError.message.includes('Security Policy:')) {
            throw new Error("ACCESS DENIED: This email has not been invited, or the invite is invalid/revoked.");
        }
        if (signUpError.message.includes("already registered")) {
             alert("Account exists!\n\nPlease go to Login and use your previous password.");
             navigate("/login");
             return;
        }
        if (signUpError.message.includes("Password should contain")) {
             throw new Error("Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.");
        }
        throw signUpError;
      }

      // SUCCESS:
      // We do NOT use alert() or navigate("/login") here. 
      // Supabase has already logged the user in. We leave setLoading(true) 
      // so the UI shows the spinner while AuthContext automatically routes them to the Dashboard!

    } catch (err) {
      console.error("Registration Error:", err.message);
      setError(err.message);
      turnstileRef.current?.reset();
      setCaptchaToken("");
      setLoading(false); // Only stop loading if there is an error
    }
  };

  // RENDER GUARD
  if (currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-200">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-gray-500 animate-pulse">Setting up your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-shell">
        {/* LEFT PANEL */}
        <div className="left-panel">
          <svg className="left-pattern" viewBox="0 0 280 540" xmlns="http://www.w3.org/2000/svg">
            <g fill="white">
              <rect x="20" y="420" width="14" height="60" rx="2"/><rect x="38" y="430" width="10" height="50" rx="2"/>
              <rect x="52" y="415" width="16" height="65" rx="2"/><rect x="72" y="425" width="12" height="55" rx="2"/>
              <rect x="88" y="410" width="18" height="70" rx="2"/><rect x="110" y="422" width="13" height="58" rx="2"/>
              <rect x="127" y="418" width="15" height="62" rx="2"/><rect x="146" y="428" width="11" height="52" rx="2"/>
              <rect x="161" y="412" width="17" height="68" rx="2"/><rect x="182" y="424" width="12" height="56" rx="2"/>
              <rect x="198" y="416" width="14" height="64" rx="2"/><rect x="216" y="420" width="16" height="60" rx="2"/>
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
            <Link to="/login" className="tab">Staff Login</Link>
            <div className="tab active">New Registration</div>
          </div>

          <div className="form-title">Staff Registration</div>
          <div className="form-desc">Complete your account setup using your invitation email.</div>

          <div className="invite-notice">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5"><circle cx="7" cy="7" r="6" stroke="#C8A96E" stroke-width="1.2"/><path d="M7 6v4M7 4.5v.5" stroke="#C8A96E" stroke-width="1.2" stroke-linecap="round"/></svg>
            <span>Your email must match the address listed in your staff invitation.</span>
          </div>
          
          {error && <div className="bg-red-50 text-red-600 p-2 rounded text-[11px] mb-4 border border-red-100">{error}</div>}

          <form onSubmit={handleRegister} className="flex flex-col flex-1">
            <div className="mb-4">
              <label className="field-label">Invited email address</label>
              <input 
                type="email" required className="auth-input" 
                value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})}
                disabled={loading}
              />
            </div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <PasswordInput 
                  label="Create password" 
                  value={formData.password} 
                  onChange={(e) => setFormData({...formData, password: e.target.value})} 
                  disabled={loading} 
                />
              </div>
              <div className="flex-1">
                <PasswordInput 
                  label="Confirm password" 
                  value={formData.confirmPass} 
                  onChange={(e) => setFormData({...formData, confirmPass: e.target.value})} 
                  disabled={loading} 
                />
              </div>
            </div>

            <div className={`flex justify-center mb-4 min-h-[65px] ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              <Turnstile 
                ref={turnstileRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} 
                onSuccess={(token) => setCaptchaToken(token)}
                options={{ theme: 'light', size: 'normal' }}
              />
            </div>

            <button type="submit" disabled={loading || !captchaToken} className="primary-btn">
              {loading ? "Registering..." : "Complete Registration"}
            </button>
            
            <div className="text-center text-[12px] text-[#64748b]">
              Already registered? <Link to="/login" className="text-[#C8A96E] font-medium">Sign in here</Link>
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