import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, Branch } from '../lib/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  branches: Branch[];
  currentBranch: Branch | null;
  loading: boolean;
  isGlobalAdmin: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null; inactive?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setCurrentBranch: (branch: Branch | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  branches: [],
  currentBranch: null,
  loading: true,
  isGlobalAdmin: false,
  signIn: async () => ({ error: null, inactive: false }),
  signOut: async () => {},
  refreshProfile: async () => {},
  setCurrentBranch: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, branch:branches(*)')
      .eq('id', userId)
      .maybeSingle();
    setProfile(profileData);

    if (profileData?.role === 'admin') {
      const { data: branchData } = await supabase.from('branches').select('*').eq('is_active', true).order('name');
      const branchesList = branchData ?? [];
      setBranches(branchesList);
      const defaultBranch = branchesList.find(b => b.is_head_office) ?? branchesList[0] ?? null;
      setCurrentBranch(defaultBranch);
    } else if (profileData?.branch_id) {
      const { data: branchData } = await supabase.from('branches').select('*').eq('id', profileData.branch_id).maybeSingle();
      setBranches(branchData ? [branchData] : []);
      setCurrentBranch(branchData);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await fetchProfile(session.user.id);
        })();
      } else {
        setProfile(null);
        setBranches([]);
        setCurrentBranch(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (identifier: string, password: string) => {
    if (!identifier.trim() || !password) {
      return { error: new Error('Invalid name or password') };
    }

    const cleanId = identifier.trim().toLowerCase();

    // Use the secure lookup function (works for unauthenticated users)
    const { data: profile, error: lookupErr } = await supabase
      .rpc('lookup_user_for_login', { p_identifier: identifier.trim() });

    if (lookupErr || !profile || profile.length === 0) {
      return { error: new Error('Invalid name or password') };
    }

    // If multiple matches, prefer exact username match, then exact name match
    let matched = profile[0];
    if (profile.length > 1) {
      const exactUsername = profile.find((p: { id: string; email: string; full_name: string; username: string; is_active: boolean }) => p.username?.toLowerCase() === cleanId);
      const exactName = profile.find((p: { id: string; email: string; full_name: string; username: string; is_active: boolean }) => p.full_name?.toLowerCase() === cleanId);
      matched = exactUsername ?? exactName ?? profile[0];
    }

    if (!matched.is_active) {
      return { error: new Error('User account is inactive'), inactive: true };
    }

    if (!matched.email) {
      return { error: new Error('Invalid name or password') };
    }

    // Authenticate using the resolved email behind the scenes
    const { error } = await supabase.auth.signInWithPassword({
      email: matched.email,
      password,
    });

    if (error) {
      return { error: new Error('Invalid name or password') };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isGlobalAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      branches,
      currentBranch,
      loading,
      isGlobalAdmin,
      signIn,
      signOut,
      refreshProfile,
      setCurrentBranch,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
