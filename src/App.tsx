import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import useTheme from './hooks/useTheme';
import './App.css';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ContestPage from './pages/ContestPage';

function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <HashRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/contest" element={<ContestPage />} />
      </Routes>
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>
    </HashRouter>
  );
}

export default App;
