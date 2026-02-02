import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setError("");

    try {
      // Directs the user to the update-password route after clicking the email link
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;
      setMsg("Check your email for the password reset link.");
    } catch (err) {
      setError(err.message);
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
                />
              </div>
              <div className="form-control mt-6">
                <button disabled={loading} className="btn btn-primary">
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          )}

          <div className="divider"></div>
          <Link to="/login" className="btn btn-link btn-sm text-gray-600 no-underline hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}