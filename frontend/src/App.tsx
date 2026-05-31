import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';

// Views — import once here; no window globals needed (proper ES modules)
import ViewPortal          from './views/ViewPortal';
import ViewFormsList       from './views/ViewFormsList';
import ViewDynamicForm     from './views/ViewDynamicForm';
import ViewMyRequests      from './views/ViewMyRequests';
import ViewProfile         from './views/ViewProfile';
import ViewLogin           from './views/ViewLogin';
import ViewRequestDetail   from './views/ViewRequestDetail';
import ViewPendingApproval from './views/ViewPendingApproval';
import ViewProjectPicker   from './views/ViewProjectPicker';
import ViewControlPanel    from './views/admin/ViewControlPanel';

function Router() {
  const { user, authReady, view, detailId, activeProject, selectedTemplate } = useApp();

  if (!authReady) {
    return <div className="view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><LoadingSpinner /></div>;
  }

  if (!user) return <ViewLogin />;
  if (user.role === null) return <ViewPendingApproval />;

  // Project-scoped views that require an active project: fall back to portal so the user picks one
  if (!activeProject && (view === 'requests' || view === 'dynamic-form')) {
    return <ViewPortal />;
  }

  switch (view) {
    case 'requests':     return <ViewFormsList />;
    case 'dynamic-form': return selectedTemplate
      ? <ViewDynamicForm template={selectedTemplate} />
      : <ViewFormsList />;
    case 'myrequests':       return <ViewMyRequests />;
    case 'profile':          return <ViewProfile />;
    case 'detail':           return <ViewRequestDetail requestId={detailId ?? ''} />;
    case 'project-picker':   return <ViewProjectPicker />;
    case 'admin':            return <ViewControlPanel />;
    default:                 return <ViewPortal />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <div className="scroll">
        <AppProvider>
          <Router />
        </AppProvider>
      </div>
    </ErrorBoundary>
  );
}
