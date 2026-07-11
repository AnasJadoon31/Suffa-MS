import React, { useState } from "react";
import { LogIn, Building2, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { Input } from "./ui/Field";


export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenant, setTenant] = useState("suffa");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await api.post("/api/v1/auth/token", {
        username,
        password,
      }, {
        headers: {
          "X-Madrasa": tenant
        }
      });
      
      const token = response.data.access_token;
      await login(token, tenant);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError("Invalid credentials. Please try again.");
      } else {
        setError("Unable to connect to the server. Please try again later.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-split">
        {/* Left Side: Branding / Hero */}
        <div className="login-hero">
          <div className="hero-content">
            <h1>MMS</h1>
            <p>Next-generation Madrasa Management System.</p>
            <div className="hero-stats">
              <div className="stat-card">
                <h3>Offline-First</h3>
                <span>Syncs seamlessly</span>
              </div>
              <div className="stat-card">
                <h3>Multi-Tenant</h3>
                <span>Secure by design</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="login-form-container">
          <div className="login-card glass">
            <div className="login-header">
              <div className="login-icon-wrapper">
                <LogIn size={28} />
              </div>
              <h2>Welcome Back</h2>
              <p>Sign in to your workspace</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              {error && <div className="login-error slide-in">{error}</div>}

              <div className="form-group">
                <label>Madrasa ID</label>
                <div className="input-with-icon">
                  <Building2 size={18} className="input-icon" />
                  <Input
                    type="text"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="e.g., suffa"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Username</label>
                <div className="input-with-icon">
                  <span className="input-icon">@</span>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Password</label>
                <div className="input-with-icon">
                  <KeyRound size={18} className="input-icon" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              <button type="submit" className="login-button" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In to Workspace"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
