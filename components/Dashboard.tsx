import React from 'react';
import {
  Sparkles,
  BarChart3,
  Package,
  TrendingUp,
  ArrowRight,
  Zap,
  Lock
} from 'lucide-react';
import { appsConfig, AppConfig } from '../apps-config';

interface DashboardProps {
  onSelectApp: (appId: string) => void;
}

const iconMap: Record<string, React.FC<any>> = {
  Sparkles,
  BarChart3,
  Package,
  TrendingUp
};

const Dashboard: React.FC<DashboardProps> = ({ onSelectApp }) => {
  const activeApps = appsConfig.filter(app => app.status === 'active');
  const comingSoonApps = appsConfig.filter(app => app.status === 'coming-soon');

  const renderAppCard = (app: AppConfig) => {
    const Icon = iconMap[app.icon] || Sparkles;
    const isActive = app.status === 'active';

    return (
      <div
        key={app.id}
        onClick={() => isActive && onSelectApp(app.id)}
        className={`
          relative overflow-hidden rounded-2xl bg-white border-2 p-6 transition-all duration-300
          ${isActive
            ? 'cursor-pointer hover:shadow-2xl hover:-translate-y-1 border-slate-200 hover:border-blue-300'
            : 'cursor-not-allowed opacity-60 border-slate-100'
          }
        `}
      >
        {!isActive && (
          <div className="absolute top-4 right-4 flex items-center space-x-1 bg-slate-100 px-3 py-1 rounded-full">
            <Lock className="w-3 h-3 text-slate-400" />
            <span className="text-xs font-medium text-slate-400">Coming Soon</span>
          </div>
        )}

        <div className="flex items-start space-x-4">
          <div className={`bg-gradient-to-br ${app.gradient} p-4 rounded-xl shadow-lg`}>
            <Icon className="w-8 h-8 text-white" />
          </div>

          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="text-xl font-semibold text-slate-900">{app.name}</h3>
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              {app.category}
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              {app.description}
            </p>
          </div>
        </div>

        {isActive && (
          <div className="mt-6 flex items-center justify-end">
            <div className="flex items-center space-x-2 text-blue-600 font-medium text-sm group-hover:translate-x-1 transition-transform">
              <span>Launch App</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center space-x-2">
            <img
              src="/grubtech-logo.png"
              alt="grubtech Logo"
              className="w-10 h-10 object-contain"
            />
            <h1 className="text-2xl font-medium text-slate-900">
              Labs
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Active Apps Section */}
        <section className="mb-16">
          <div className="flex items-center space-x-3 mb-6">
            <div className="h-1 w-12 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"></div>
            <h2 className="text-2xl font-semibold text-slate-900">Available Apps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeApps.map(renderAppCard)}
          </div>
        </section>

        {/* Coming Soon Section */}
        {comingSoonApps.length > 0 && (
          <section>
            <div className="flex items-center space-x-3 mb-6">
              <div className="h-1 w-12 bg-gradient-to-r from-slate-400 to-slate-300 rounded-full"></div>
              <h2 className="text-2xl font-semibold text-slate-900">Coming Soon</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {comingSoonApps.map(renderAppCard)}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs font-normal text-slate-400 uppercase tracking-[0.2em]">
            Internal Tooling • Built for grubtech Operations • Powered by AI
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
