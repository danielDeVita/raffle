import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  role: 'USER' | 'ADMIN' | 'BANNED';
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null; // Store access token for Authorization header
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setAuth: (user: User, token: string) => void;
  getToken: () => string | null;
  setToken: (token: string) => void;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      hasHydrated: false,

      setAuth: (user, token) => {
        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      },

      getToken: () => {
        return get().token;
      },

      setToken: (token) => {
        set({ token });
      },

      logout: async () => {
        try {
          // Call backend to clear any server-side session
          await fetch(`${BACKEND_URL}/auth/logout`, {
            method: 'GET',
            credentials: 'include',
          });
        } catch {
          // Ignore errors - just clear local state
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      updateUser: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } });
        }
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error, isLoading: false });
      },

      clearError: () => {
        set({ error: null });
      },

      setHasHydrated: (state) => {
        set({ hasHydrated: state });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Persist user info plus access token needed for Authorization headers.
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
