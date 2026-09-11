import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError, inactive } = await signIn(username, password);
    if (signInError) {
      setError(inactive ? 'User account is inactive' : 'Invalid name or password');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900 to-slate-900 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center">
              <Building2 size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Al Luluah</h1>
              <p className="text-blue-300 text-sm">Tents & Sheds</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Enterprise Resource Planning
          </h2>
          <p className="text-slate-300 text-lg leading-relaxed">
            Complete business management — quotations, invoices, inventory, HR, accounting, and POS all in one system built for UAE compliance.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {['UAE VAT 5%', 'PDF Invoices', 'Real-time Analytics', 'Role-based Access'].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-slate-300">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center">
              <Building2 size={24} className="text-white" />
            </div>
            <div className="text-white">
              <h1 className="text-xl font-bold">Al Luluah</h1>
              <p className="text-blue-300 text-xs">Tents & Sheds ERP</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h2>
            <p className="text-slate-500 mb-8">Sign in to your account</p>

            <form onSubmit={handleSubmit} className="space-y-5">

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Name / Username</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your name or username"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <p className="text-center pt-2 text-xs text-slate-500">
                New users are created by an administrator.
              </p>
            </form>
          </div>

          <p className="text-center text-slate-500 text-xs mt-6">
            Al Luluah Tents & Sheds ERP &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
