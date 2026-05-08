import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

const CLIENT_ALLOWED = ['/inbox', '/appointments', '/transfers'];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const location = useLocation();

  if (loading || (user && roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (role === 'client') {
    const allowed = CLIENT_ALLOWED.some((p) => location.pathname.startsWith(p));
    if (!allowed) return <Navigate to="/inbox" replace />;
  }

  return <>{children}</>;
}
