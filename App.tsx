import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import MenuStudioApp from './components/MenuStudioApp';

type AppRoute = 'dashboard' | 'menu-studio';

const App: React.FC = () => {
  // Load saved route from localStorage, default to 'dashboard'
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    const saved = localStorage.getItem('currentRoute');
    return (saved as AppRoute) || 'dashboard';
  });

  // Save route to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('currentRoute', currentRoute);
  }, [currentRoute]);

  const handleSelectApp = (appId: string) => {
    if (appId === 'menu-studio') {
      setCurrentRoute('menu-studio');
    }
    // Future apps can be added here
  };

  const handleBackToDashboard = () => {
    setCurrentRoute('dashboard');
  };

  return (
    <>
      <div className={currentRoute === 'dashboard' ? '' : 'hidden'}>
        <Dashboard onSelectApp={handleSelectApp} />
      </div>
      <div className={currentRoute === 'menu-studio' ? '' : 'hidden'}>
        <MenuStudioApp onBack={handleBackToDashboard} />
      </div>
    </>
  );
};

export default App;
