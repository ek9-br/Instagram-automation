import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import PostsPage from "./pages/PostsPage";
import PostDetailPage from "./pages/PostDetailPage";
import LookupsAdminPage from "./pages/LookupsAdminPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
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
  { path: "/signup", element: <SignUpPage /> },
  { path: "/", element: protect(<PostsPage />) },
  { path: "/post/:id", element: protect(<PostDetailPage />) },
  { path: "/opcoes", element: protect(<LookupsAdminPage />) },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
