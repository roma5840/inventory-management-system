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

    if (!code) return; // No code = session already exists (refresh/new-tab), AuthContext handles it

    // First arrival — exchange code, then clean URL so refresh never re-attempts exchange
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          console.error("Code exchange failed:", error.message);
          navigate("/login");
          return;
        }
        window.history.replaceState({}, '', '/update-password'); // Strip ?code= from URL
      });
  }, [navigate]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Please request a new link.");
      
      const email = session.user.email;

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (updateError.message.includes("Password should contain")) {
          throw new Error("Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.");
        }
        throw updateError;
      }

      // Force fresh JWT with method="password" — guarantees isRecoveryMode clears on all tabs
      await supabase.auth.signInWithPassword({ email, password });
      
      clearRecoveryMode();
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Password Update Error:", err.message);
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
            <PasswordInput 
              label="New Password"
              placeholder="Enter new password"
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
            />
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