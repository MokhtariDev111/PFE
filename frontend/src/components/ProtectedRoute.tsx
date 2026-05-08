import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function TeacherRoute({ children }: { children: ReactNode }) {
  const { user, isTeacher } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isTeacher) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
