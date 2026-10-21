import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useTheme } from './hooks/useTheme';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';

function Protected({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function BootScreen() {
  return (
    <div className="auth-shell">
      <div className="boot-note">
        <span className="boot-bar" aria-hidden="true" />
        Đang kiểm tra phiên đăng nhập…
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checking } = useAuth();

  // Applied at the root so the palette covers every screen, including the
  // pre-auth pages and the boot screen, not just the chat shell.
  useTheme();

  if (checking) return <BootScreen />;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/chat" replace /> : <AuthPage mode="login" />}
      />
      <Route
        path="/signup"
        element={isAuthenticated ? <Navigate to="/chat" replace /> : <AuthPage mode="signup" />}
      />
      <Route
        path="/chat"
        element={
          <Protected>
            <ChatPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/chat' : '/login'} replace />} />
    </Routes>
  );
}
