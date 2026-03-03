import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import useTheme from './hooks/useTheme';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/Toast';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ContestPage from './pages/ContestPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';

function AppRoutes() {
  const { logoutKey } = useAuth();
  return (
    <Routes key={logoutKey}>
      <Route path="/" element={<HomePage />} />
      <Route path="/contest" element={<ContestPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <Navbar />
          <AppRoutes />
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <ToastContainer />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
