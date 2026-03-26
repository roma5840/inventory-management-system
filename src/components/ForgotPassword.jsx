import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { Turnstile } from "@marsidev/react-turnstile";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef(null);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setError("");

    try {
      // Directs the user to the update-password route after clicking the email link
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
        captchaToken,
      });

      if (error) throw error;
      setMsg("Check your email for the password reset link.");
    } catch (err) {
      setError(err.message);
      turnstileRef.current?.reset();
      setCaptchaToken("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-col items-center mb-4">
            <Logo className="w-16 h-16 mb-2" />
            <h2 className="text-xl font-bold text-blue-900">Reset Password</h2>
          </div>

          {error && <div className="alert alert-error text-xs py-2">{error}</div>}
          {msg && <div className="alert alert-success text-xs py-2">{msg}</div>}

          {!msg && (
            <form onSubmit={handleReset}>
              <div className="form-control">
                <label className="label"><span className="label-text">Enter Registered Email</span></label>
                <input 
                  type="email" required className="input input-bordered" 
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

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

              <div className="form-control mt-4">
                <button disabled={loading || !captchaToken} className="btn btn-primary">
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          )}

          <div className="divider"></div>
          <Link 
            to="/login" 
            className={`btn btn-link btn-sm text-gray-600 no-underline hover:underline ${loading ? "pointer-events-none opacity-50" : ""}`}
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}