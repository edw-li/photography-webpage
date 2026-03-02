import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import useTheme from './hooks/useTheme';
import './App.css';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/Toast';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ContestPage from './pages/ContestPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminPage from './pages/AdminPage';

function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/contest" element={<ContestPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
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
