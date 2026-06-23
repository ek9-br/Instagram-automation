import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import PostsPage from "./pages/PostsPage";
import PostDetailPage from "./pages/PostDetailPage";
import CriativosPage from "./pages/CriativosPage";
import LookupsAdminPage from "./pages/LookupsAdminPage";
import SignInPage from "./pages/SignInPage";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";
import { LookupsProvider } from "./data/lookups";
import "./styles.css";

const protect = (el: React.ReactNode) => (
  <RequireAuth>
    <LookupsProvider>{el}</LookupsProvider>
  </RequireAuth>
);

const router = createHashRouter([
  { path: "/signin", element: <SignInPage /> },
  { path: "/", element: protect(<PostsPage />) },
  { path: "/criativos", element: protect(<CriativosPage />) },
  { path: "/post/:id", element: protect(<PostDetailPage />) },
  { path: "/opcoes", element: protect(<LookupsAdminPage />) },
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
