import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  trend?: number;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'cyan' | 'slate';
}

const colorMap = {
  blue:  { icon: 'bg-primary-100 text-primary-600' },
  green: { icon: 'bg-green-100 text-green-600' },
  amber: { icon: 'bg-amber-100 text-amber-600' },
  red:   { icon: 'bg-red-100 text-red-600' },
  cyan:  { icon: 'bg-cyan-100 text-cyan-600' },
  slate: { icon: 'bg-slate-100 text-slate-500' },
};

export default function StatCard({ title, value, subtitle, icon, trend, color = 'blue' }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 ${c.icon} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-slate-400'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-sm text-slate-500 mt-0.5">{title}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}
