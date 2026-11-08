import { useHashRoute } from './lib/router';
import { AuthProvider } from './lib/auth';
import { NoticesProvider } from './lib/notices';
import { Shell } from './components/shell';
import { ErrorBoundary } from './components/error-boundary';
import BoardsPage from './pages/boards';
import MonitorPage from './pages/monitor';
import SearchPage from './pages/search';
import DashboardPage from './pages/dashboard';
import ChatPage from './pages/chat';
import ProfilePage from './pages/profile';
import AuthPage from './pages/auth';
import SettingsPage from './pages/settings';

export default function App() {
  const [route, navigate] = useHashRoute();

  return (
    <AuthProvider>
      <NoticesProvider>
        <Shell page={route.page} navigate={navigate}>
          <ErrorBoundary page={route.page}>
            {route.page === 'boards' && <BoardsPage />}
            {route.page === 'monitor' && <MonitorPage params={route.params} navigate={navigate} />}
            {route.page === 'search' && <SearchPage />}
            {route.page === 'dashboard' && <DashboardPage navigate={navigate} />}
            {route.page === 'chat' && <ChatPage navigate={navigate} />}
            {route.page === 'profile' && <ProfilePage navigate={navigate} />}
            {route.page === 'auth' && <AuthPage navigate={navigate} next={route.params.next} />}
            {route.page === 'settings' && <SettingsPage />}
          </ErrorBoundary>
        </Shell>
      </NoticesProvider>
    </AuthProvider>
  );
}
