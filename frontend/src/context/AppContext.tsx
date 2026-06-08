import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { auth, type UserSession, type ProjectSummary } from '../auth';

interface AppState {
  user:          UserSession | null;
  setUser(u: UserSession | null): void;
  authReady:     boolean;
  logout():      Promise<void>;
  activeProject: ProjectSummary | null;
  setActiveProject(p: ProjectSummary | null): void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user,             setUser]             = useState<UserSession | null>(null);
  const [authReady,        setAuthReady]        = useState(false);
  const [activeProject,    setActiveProjectRaw] = useState<ProjectSummary | null>(null);

  const setActiveProject = (p: ProjectSummary | null) => {
    setActiveProjectRaw(p);
  };

  useEffect(() => {
    auth.getSession().then(s => {
      setUser(s);
      setAuthReady(true);
    });
  }, []);

  const logout = async () => {
    await auth.signOut();
    setUser(null);
    setActiveProjectRaw(null);
  };

  return (
    <Ctx.Provider value={{ user, setUser, authReady, logout, activeProject, setActiveProject }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
