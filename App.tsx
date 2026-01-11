import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import MenuStudioApp from './components/MenuStudioApp';

type AppRoute = 'dashboard' | 'menu-studio';

const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('dashboard');

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
      {currentRoute === 'dashboard' && (
        <Dashboard onSelectApp={handleSelectApp} />
      )}
      {currentRoute === 'menu-studio' && (
        <MenuStudioApp onBack={handleBackToDashboard} />
      )}
    </>
  );
};

export default App;
