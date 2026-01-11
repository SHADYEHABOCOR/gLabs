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
      <div style={{ display: currentRoute === 'dashboard' ? 'block' : 'none' }}>
        <Dashboard onSelectApp={handleSelectApp} />
      </div>
      <div style={{ display: currentRoute === 'menu-studio' ? 'block' : 'none' }}>
        <MenuStudioApp onBack={handleBackToDashboard} />
      </div>
    </>
  );
};

export default App;
