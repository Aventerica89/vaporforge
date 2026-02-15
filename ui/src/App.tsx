import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { McpRelayProvider } from './components/McpRelayProvider';
import { UpdateToast } from './components/UpdateToast';
import { ToastContainer } from './components/ToastContainer';
import { useAuthStore } from './hooks/useAuth';
import { toast } from './hooks/useToast';

export default function App() {
  const { checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Listen for config restoration after container recycle
  useEffect(() => {
    const handler = () => {
      toast.info('Config restored after container recycle', 4000);
    };
    window.addEventListener('vf:config-restored', handler);
    return () => window.removeEventListener('vf:config-restored', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-up">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-primary/30" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="font-display text-sm uppercase tracking-wider text-muted-foreground">
            Initializing...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AuthGuard>
        <McpRelayProvider>
          <Layout />
        </McpRelayProvider>
      </AuthGuard>
      <UpdateToast />
      <ToastContainer />
    </>
  );
}
