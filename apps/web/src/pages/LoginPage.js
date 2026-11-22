import { useState } from "react";
import Logo from "../components/Logo";
import { useAuth } from "../auth/AuthContext";

// Where users sign up, confirm their email or reset a password. Override with REACT_APP_PORTAL_URL.
const PORTAL_URL = process.env.REACT_APP_PORTAL_URL || "https://hisab-kitab-mn.vercel.app/login";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try { await signIn(email, password); }
    catch (err) { setError(err.message); setSubmitting(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand"><Logo /></div>
        <p className="login-sub">Sign in with your Hisab-Kitab email and password to see your insights.</p>
        {error && <div className="login-error" role="alert">{error}</div>}
        <label className="login-field">Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="login-field">Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="login-btn" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        <p className="login-hint">
          New here, or forgot your password?{" "}
          <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">Open Hisab-Kitab <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" style={{ fontSize: 10 }}></i></a>
        </p>
      </form>
    </div>
  );
}
