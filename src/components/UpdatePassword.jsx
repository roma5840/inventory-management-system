import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

export default function UpdatePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Ensure user is authenticated (via the magic link) before showing form
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      }
    });
  }, [navigate]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;
      
      alert("Password updated successfully! You will be redirected to the dashboard.");
      navigate("/");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-col items-center mb-4">
            <Logo className="w-16 h-16 mb-2" />
            <h2 className="text-xl font-bold text-blue-900">Set New Password</h2>
          </div>

          {error && <div className="alert alert-error text-xs py-2">{error}</div>}

          <form onSubmit={handleUpdate}>
            <div className="form-control">
              <label className="label"><span className="label-text">New Password</span></label>
              <input 
                type="password" required className="input input-bordered" 
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="form-control mt-6">
              <button disabled={loading} className="btn btn-primary">
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}