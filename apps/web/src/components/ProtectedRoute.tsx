import { Navigate } from 'react-router-dom';
import { getToken } from '../lib/auth';
import type { PropsWithChildren } from 'react';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/auth/login" replace />;
  }
  return <>{children}</>;
}
