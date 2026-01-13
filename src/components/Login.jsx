import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) navigate("/");
  }, [currentUser, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      // No navigate needed here; useeffect handles it naturally.
      // do not set loading(false) to prevent the button from flickering
    } catch (err) {
      setError("Failed to sign in. Check email/password.");
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
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl justify-center text-blue-800">BookstoreIMS</h2>
          <p className="text-center text-gray-500 text-sm mb-4">Finance Dept. Access Only</p>
          
          {error && <div className="alert alert-error text-sm py-2">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-control">
              <label className="label"><span className="label-text">Email</span></label>
              <input 
                type="email" required className="input input-bordered" 
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-control mt-2">
              <label className="label"><span className="label-text">Password</span></label>
              <input 
                type="password" required className="input input-bordered" 
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="form-control mt-6">
              <button disabled={loading} className="btn btn-primary">
                {loading ? "Verifying..." : "Login"}
              </button>
            </div>
          </form>

          <div className="divider">OR</div>
          <Link to="/register" className="btn btn-link btn-sm text-gray-600">
            Have an invite code? Register
          </Link>
        </div>
      </div>
    </div>
  );
}