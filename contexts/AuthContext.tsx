import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { getCurrentUser, onAuthStateChange, signInWithGoogle, signOut, signUpWithEmail, signInWithEmail } from '../services/supabaseService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInGoogle: () => Promise<{ success: boolean; error?: string }>;
  signInEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUpEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }>;
  logOut: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInGoogle: async () => ({ success: false }),
  signInEmail: async () => ({ success: false }),
  signUpEmail: async () => ({ success: false }),
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

  const signInGoogle = async () => {
    return signInWithGoogle();
  };

  const signInEmail = async (email: string, password: string) => {
    return signInWithEmail(email, password);
  };

  const signUpEmail = async (email: string, password: string) => {
    return signUpWithEmail(email, password);
  };

  const logOut = async () => {
    const result = await signOut();
    if (result.success) {
      setUser(null);
    }
    return result;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInGoogle, signInEmail, signUpEmail, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
