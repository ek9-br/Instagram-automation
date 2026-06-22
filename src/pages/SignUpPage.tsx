import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function SignUpPage() {
  const { signUp, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    setBusy(true);
    const { error, needsConfirmation } = await signUp(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
    } else if (needsConfirmation) {
      setInfo("Conta criada! Confirme o email para entrar.");
    } else {
      navigate("/");
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Criar conta</h1>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error-banner">{error}</p>}
        {info && <p className="info-banner">{info}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Criando…" : "Criar conta"}
        </button>
        <p className="auth-alt">
          Já tem conta? <Link to="/signin">Entrar</Link>
        </p>
      </form>
    </div>
  );
}
