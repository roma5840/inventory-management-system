import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

export default function Register() {
  const { currentUser } = useAuth(); // Get currentUser to check auth state
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "", confirmPass: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If manually navigating to /register while logged in
  useEffect(() => {
    if (currentUser) navigate("/");
  }, [currentUser, navigate]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { email, password, confirmPass } = formData;

    if (password !== confirmPass) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      // 1. Check Invite Status via Secure RPC (Fixes 406 Error)
      const { data: inviteData, error: rpcError } = await supabase
        .rpc('verify_invite_for_registration', { email_input: email });

      if (rpcError) throw rpcError;

      // The RPC returns an array of rows. We check the first result.
      const invite = inviteData?.[0];

      if (!invite || !invite.invite_exists) {
        throw new Error("ACCESS DENIED: This email has not been invited by Admin.");
      }
      
      if (invite.user_status === "REGISTERED") {
        throw new Error("This account is already registered. Please Login.");
      }

      if (invite.user_status === "INACTIVE") {
        throw new Error("This invite has been revoked.");
      }

      // 2. Create Supabase Auth User
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
             alert("Account exists!\n\nPlease go to Login and use your previous password.");
             navigate("/login");
             return;
        }
        throw signUpError;
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
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

          <form onSubmit={handleRegister} className="flex flex-col gap-3">
             <div className="form-control">
              <label className="label"><span className="label-text">Email (Must match Invite)</span></label>
              <input 
                type="email" required className="input input-bordered" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Create Password</span></label>
              <input 
                type="password" required className="input input-bordered" 
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Confirm Password</span></label>
              <input 
                type="password" required className="input input-bordered" 
                value={formData.confirmPass}
                onChange={(e) => setFormData({...formData, confirmPass: e.target.value})}
              />
            </div>

            <button disabled={loading} className="btn btn-primary mt-4">
              {loading ? "Verifying Invite..." : "Complete Registration"}
            </button>
          </form>

          <div className="divider">OR</div>
          <Link to="/login" className="btn btn-link btn-sm">
            Already registered? Login here
          </Link>
        </div>
      </div>
    </div>
  );
}