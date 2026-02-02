import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

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
          <div className="flex flex-col items-center mb-4">
            <Logo className="w-24 h-24 mb-2" />
            <h2 className="text-2xl font-bold text-blue-900">Login</h2>
            <p className="text-center text-gray-500 text-xs tracking-wider uppercase">Finance Dept. Access Portal</p>
          </div>
          
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
              <label className="label">
                <Link to="/forgot-password" className="label-text-alt link link-hover text-blue-600">
                  Forgot password?
                </Link>
              </label>
            </div>
            <div className="form-control mt-6">
              <button disabled={loading} className="btn btn-primary">
                {loading ? "Verifying..." : "Login"}
              </button>
            </div>
          </form>

          <div className="divider">OR</div>
          <Link to="/register" className="btn btn-link btn-sm text-gray-600">
            Have an invitation? Register
          </Link>
        </div>
      </div>
    </div>
  );
}