import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const homeForType = (t) => {
  if (t === 'club_owner') return '/club';
  if (t === 'tournament_organizer') return '/tournaments';
  if (t === 'player') return '/';
  return '/account';
};

export default function RequireUserType({ allowed }) {
  const { user, authChecked, isLoadingAuth } = useAuth();

  if (isLoadingAuth || !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-lime-400 rounded-full animate-spin"></div>
      </div>
    );
  }

  const type = user?.user_type || null;
  if (!allowed.includes(type)) {
    return <Navigate to={homeForType(type)} replace />;
  }
  return <Outlet />;
}