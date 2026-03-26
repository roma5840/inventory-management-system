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
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-col items-center mb-2">
            <Logo className="w-16 h-16" />
            <h2 className="card-title text-blue-800 mt-2">Staff Registration</h2>
          </div>
          
          {error && <div className="alert alert-error text-xs">{error}</div>}

          <form onSubmit={handleRegister} className="flex flex-col gap-1">
              <div className="form-control w-full">
              <label className="label"><span className="label-text">Email (Must match Invite)</span></label>
              <input 
                type="email" required className="input input-bordered w-full" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                disabled={loading}
              />
            </div>

            <PasswordInput 
              label="Create Password"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              disabled={loading}
            />

            <PasswordInput 
              label="Confirm Password"
              value={formData.confirmPass}
              onChange={(e) => setFormData({...formData, confirmPass: e.target.value})}
              disabled={loading}
            />

            <div className={`flex justify-center mt-4 min-h-[65px] ${loading ? "pointer-events-none opacity-50" : ""}`}>
              <Turnstile 
                ref={turnstileRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} 
                onSuccess={(token) => {
                  setCaptchaToken(token);
                  setError("");
                }}
                onError={() => {
                  setCaptchaToken("");
                  setError("Security verification failed. Please refresh or try again.");
                }}
                onExpire={() => {
                  setCaptchaToken("");
                  setError("Security verification expired. Please check the box again.");
                }}
                options={{ theme: 'light' }}
              />
            </div>

            <button disabled={loading || !captchaToken} className="btn btn-primary mt-4">
              {loading ? "Verifying Invite..." : "Complete Registration"}
            </button>
          </form>

          <div className="divider">OR</div>
          <Link to="/login" className={`btn btn-link btn-sm ${loading ? "pointer-events-none opacity-50" : ""}`}>
            Already registered? Login here
          </Link>
        </div>
      </div>
    </div>
  );
}