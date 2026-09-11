import { Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { profile } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
      <div className="pl-10 lg:pl-0">
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell size={17} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-medium text-slate-700">{profile?.full_name}</div>
            <div className="text-xs text-slate-400 capitalize">{profile?.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
