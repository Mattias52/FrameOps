import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { getCurrentUser, onAuthStateChange, signInWithGoogle, signOut } from '../services/supabaseService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<{ success: boolean; error?: string }>;
  logOut: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ success: false }),
  logOut: async () => ({ success: false }),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial auth state
    getCurrentUser().then((user) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const { unsubscribe } = onAuthStateChange((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    return signInWithGoogle();
  };

  const logOut = async () => {
    const result = await signOut();
    if (result.success) {
      setUser(null);
    }
    return result;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
