import { Navigate } from "react-router-dom";
import { type ReactNode } from "react";
import { useAuth } from "./AuthContext";

// Protege rotas: sem sessão → redireciona para /signin.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Carregando…</p>
      </div>
    );
  }
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}
