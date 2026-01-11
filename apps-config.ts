export interface AppConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  category: string;
  status: 'active' | 'coming-soon';
  route?: string;
}

export const appsConfig: AppConfig[] = [
  {
    id: 'menu-studio',
    name: 'Menu Studio Pro',
    description: 'Transform, clean, and enhance menu item data with AI-powered translation and image management for GCC markets',
    icon: 'Sparkles',
    color: 'blue',
    gradient: 'from-blue-500 to-blue-600',
    category: 'Menu Management',
    status: 'active',
    route: '/menu-studio'
  },
  {
    id: 'coming-soon-1',
    name: 'Analytics Dashboard',
    description: 'Real-time insights and performance metrics for your menu operations',
    icon: 'BarChart3',
    color: 'purple',
    gradient: 'from-purple-500 to-purple-600',
    category: 'Analytics',
    status: 'coming-soon'
  },
  {
    id: 'coming-soon-2',
    name: 'Inventory Manager',
    description: 'Track and manage your restaurant inventory with smart alerts and predictions',
    icon: 'Package',
    color: 'green',
    gradient: 'from-green-500 to-green-600',
    category: 'Operations',
    status: 'coming-soon'
  },
  {
    id: 'coming-soon-3',
    name: 'Price Optimizer',
    description: 'AI-powered pricing recommendations based on market trends and competition',
    icon: 'TrendingUp',
    color: 'orange',
    gradient: 'from-orange-500 to-orange-600',
    category: 'Intelligence',
    status: 'coming-soon'
  }
];
