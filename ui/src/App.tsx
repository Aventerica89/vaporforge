import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { useAuthStore } from './hooks/useAuth';

export default function App() {
  const { checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <Layout />
    </AuthGuard>
  );
}
