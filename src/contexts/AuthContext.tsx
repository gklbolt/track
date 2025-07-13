import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: 'admin' | 'student') => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isStudent: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileRetryCount, setProfileRetryCount] = useState(0);

  const fetchUserProfile = async (userId: string, retryCount: number = 0): Promise<Profile | null> => {
    try {
      console.log(`🔄 Fetching profile for user: ${userId} (attempt ${retryCount + 1})`);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ Error fetching profile:', error);
        
        // If profile doesn't exist, try to create it
        if (error.code === 'PGRST116' && retryCount < 2) {
          console.log('🔄 Profile not found, attempting to create...');
          
          // Try to get user info from auth
          const { data: authData } = await supabase.auth.getUser();
          
          if (authData.user) {
            const profileData = {
              id: authData.user.id,
              email: authData.user.email || '',
              full_name: authData.user.user_metadata?.full_name || null,
              role: authData.user.user_metadata?.role || 'student' as 'admin' | 'student',
            };

            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert(profileData)
              .select()
              .single();

            if (createError) {
              console.error('❌ Error creating profile:', createError);
              return null;
            }

            console.log('✅ Profile created successfully:', newProfile.role);
            return newProfile;
          }
        }
        
        // Retry on network errors
        if (error.message.includes('Failed to fetch') && retryCount < 3) {
          console.log(`🔄 Network error, retrying... (${retryCount + 1}/3)`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return fetchUserProfile(userId, retryCount + 1);
        }
        
        return null;
      }

      console.log('✅ Profile fetched successfully:', data.role);
      return data;
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      
      // Retry on network errors
      if (retryCount < 3) {
        console.log(`🔄 Retrying profile fetch... (${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return fetchUserProfile(userId, retryCount + 1);
      }
      
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      const userProfile = await fetchUserProfile(user.id);
      setProfile(userProfile);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');
        
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('❌ Error getting session:', error);
          setUser(null);
          setProfile(null);
          setSession(null);
          setLoading(false);
          return;
        }

        if (currentSession?.user) {
          console.log('✅ Found existing session for user:', currentSession.user.id);
          setSession(currentSession);
          setUser(currentSession.user);
          
          const userProfile = await fetchUserProfile(currentSession.user.id);
          if (mounted) {
            setProfile(userProfile);
          }
        } else {
          console.log('ℹ️ No existing session found');
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const handleAuthStateChange = async (event: string, newSession: Session | null) => {
      if (!mounted) return;
      
      console.log('🔄 Auth state change:', event, newSession?.user?.id || 'no user');
      
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession?.user) {
        try {
          const userProfile = await fetchUserProfile(newSession.user.id);
          if (mounted) {
            setProfile(userProfile);
          }
        } catch (error) {
          console.error('❌ Error fetching profile in auth change:', error);
          if (mounted) {
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Initialize auth
    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔄 Starting sign in process...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      
      if (error) {
        console.error('❌ Sign in error:', error);
        return { error };
      }
      
      if (!data.user || !data.session) {
        console.error('❌ No user or session returned');
        return { error: new Error('Authentication failed') };
      }
      
      console.log('✅ Sign in successful for user:', data.user.id);
      return { error: null };
      
    } catch (error) {
      console.error('❌ Unexpected sign in error:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: 'admin' | 'student') => {
    try {
      console.log('🔄 Starting sign up process...');
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          }
        }
      });

      if (error) {
        console.error('❌ Sign up error:', error);
        return { error };
      }

      if (data.user) {
        // Create profile
        const profileData = {
          id: data.user.id,
          email: email.trim().toLowerCase(),
          full_name: fullName,
          role,
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .insert(profileData);

        if (profileError) {
          console.error('❌ Error creating profile:', profileError);
          return { error: profileError };
        }
        
        console.log('✅ Sign up successful');
      }

      return { error: null };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      console.log('🔄 Starting sign out process...');
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ Sign out error:', error);
      } else {
        console.log('✅ Sign out successful');
      }
      
      // Clear state immediately
      setUser(null);
      setProfile(null);
      setSession(null);
      setProfileRetryCount(0);
      
    } catch (error) {
      console.error('❌ Sign out error:', error);
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isStudent = profile?.role === 'student';

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin,
    isStudent,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}