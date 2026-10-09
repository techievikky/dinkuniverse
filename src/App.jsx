import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import PlayDetail from '@/pages/PlayDetail';
import Account from '@/pages/Account';
import ClubHub from '@/pages/ClubHub';
import ClubReports from '@/pages/ClubReports';
import Tournaments from '@/pages/Tournaments';
import TournamentManager from '@/pages/TournamentManager';
import PlayMode from '@/pages/PlayMode';
import RequireUserType from '@/components/RequireUserType';
import RequireRole from '@/components/RequireRole';
import Admin from '@/pages/Admin';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ThankYou from '@/pages/ThankYou';
import { ChatNotificationsProvider } from "@/lib/ChatNotificationsContext";
import { Navigate } from 'react-router-dom';
// Add page imports here

// Sync the app theme with the OS preference when no explicit theme is chosen.
function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <ChatNotificationsProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/ThankYou" element={<ThankYou />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/account" element={<Account />} />
          <Route element={<RequireUserType allowed={["player"]} />}>
            {/* Player tab pages render persistently via <PlayerTabPanels/> in Layout to preserve view state across tab switches; routes stay for URL matching and role gating. */}
            <Route path="/" element={<></>} />
            <Route path="/new" element={<></>} />
            <Route path="/stats" element={<></>} />
            <Route path="/profile" element={<></>} />
            <Route path="/availability" element={<></>} />
            <Route path="/chats" element={<></>} />
            <Route path="/clubs" element={<></>} />
            <Route path="/players" element={<></>} />
            <Route path="/events" element={<></>} />
            <Route path="/plays/:id" element={<PlayDetail />} />
          </Route>
          <Route element={<RequireUserType allowed={["club_owner"]} />}>
            <Route path="/club" element={<ClubHub />} />
            <Route path="/club/reports" element={<ClubReports />} />
          </Route>
          <Route element={<RequireUserType allowed={["tournament_organizer"]} />}>
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/:id" element={<TournamentManager />} />
            <Route path="/tournaments/:id/play" element={<PlayMode />} />
          </Route>
          <Route element={<RequireRole allowed={["admin"]} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </ChatNotificationsProvider>
  );
};


function App() {

  return (
    <AuthProvider>
      <ThemeSync />
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App