import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { auth, type UserSession, type ProjectSummary } from '../auth';
import type { FormTemplate } from '../api/formTemplates';

export type View =
  | 'portal' | 'requests' | 'dynamic-form'
  | 'myrequests' | 'profile' | 'detail'
  | 'pending' | 'project-picker' | 'admin';

interface AppState {
  user:          UserSession | null;
  setUser(u: UserSession | null): void;   // Bug #1 fix — was missing, so ViewLogin couldn't update state
  authReady:     boolean;
  view:          View;
  detailId:      string | null;
  go(next: View, params?: { id?: string }): void;
  logout():      Promise<void>;
  activeProject:    ProjectSummary | null;
  setActiveProject(p: ProjectSummary | null): void;
  selectedTemplate: FormTemplate | null;
  setSelectedTemplate(t: FormTemplate | null): void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user,            setUser]            = useState<UserSession | null>(null);
  const [authReady,       setAuthReady]       = useState(false);
  const [view,            setView]            = useState<View>(() => (localStorage.getItem('provana_view') as View) || 'portal');
  const [anim,            setAnim]            = useState('');
  const [detailId,        setDetailId]        = useState<string | null>(null);
  const [activeProject,     setActiveProjectState]    = useState<ProjectSummary | null>(null);
  const [selectedTemplate,  setSelectedTemplate]       = useState<FormTemplate | null>(null);

  const setActiveProject = (p: ProjectSummary | null) => {
    setActiveProjectState(p);
    if (p) {
      localStorage.setItem('provana_active_project', JSON.stringify(p));
    } else {
      localStorage.removeItem('provana_active_project');
    }
  };

  useEffect(() => {
    auth.getSession().then(s => {
      setUser(s);
      setAuthReady(true);
      if (s && s.projects.length > 0) {
        const stored = localStorage.getItem('provana_active_project');
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as ProjectSummary;
            const hasAccess = s.projects.some(p => p.id === parsed.id);
            if (hasAccess) {
              setActiveProjectState(parsed);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    });
  }, []);

  /**
   * Navigate to a view. Bug #2 fix: the previous `if (next === view && !params?.id) return`
   * blocked navigation when the target was the current view — which made `go('portal')`
   * after login a no-op (since 'portal' is the default localStorage value). Now we always
   * trigger the transition; React reconciles the same-view case cheaply.
   */
  const go = (next: View, params?: { id?: string }) => {
    setAnim('out');
    setTimeout(() => {
      if (params?.id) setDetailId(params.id);
      setView(next);
      localStorage.setItem('provana_view', next);
      document.querySelector('.scroll')?.scrollTo(0, 0);
      setAnim('');
    }, 170);
  };

  const logout = async () => {
    await auth.signOut();
    setUser(null);
    setActiveProject(null);
    // Reset to portal so the router lands on ViewLogin (unauthenticated → login)
    setView('portal');
    localStorage.setItem('provana_view', 'portal');
  };

  return (
    <Ctx.Provider value={{ user, setUser, authReady, view, detailId, go, logout, activeProject, setActiveProject, selectedTemplate, setSelectedTemplate }}>
      <div className={`view-anim ${anim}`}>{children}</div>
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

