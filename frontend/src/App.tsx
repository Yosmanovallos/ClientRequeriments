import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';

import ViewPortal          from './views/ViewPortal';
import ViewFormsList       from './views/ViewFormsList';
import ViewDynamicForm     from './views/ViewDynamicForm';
import ViewMyRequests      from './views/ViewMyRequests';
import ViewProfile         from './views/ViewProfile';
import ViewLogin           from './views/ViewLogin';
import ViewRequestDetail   from './views/ViewRequestDetail';
import ViewPendingApproval from './views/ViewPendingApproval';
import ViewDeactivated     from './views/ViewDeactivated';
import ViewProjectPicker   from './views/ViewProjectPicker';
import ViewControlPanel    from './views/admin/ViewControlPanel';

function AuthGuard() {
  const { user, authReady } = useApp();
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!user.isActive) return <Navigate to="/deactivated" replace />;
  if (user.role === null) return <Navigate to="/pending" replace />;

  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <div className="scroll">
        <AppProvider>
          <BrowserRouter basename="/provana/customer/portal">
            <Routes>
              {/* Public routes */}
              <Route path="/login"       element={<ViewLogin />} />
              <Route path="/pending"     element={<ViewPendingApproval />} />
              <Route path="/deactivated" element={<ViewDeactivated />} />

              {/* Protected routes */}
              <Route element={<AuthGuard />}>
                <Route path="/"                                    element={<ViewPortal />} />
                <Route path="/pick"                                element={<ViewProjectPicker />} />
                <Route path="/profile"                             element={<ViewProfile />} />
                <Route path="/admin/*"                             element={<ViewControlPanel />} />
                <Route path="/requests"                            element={<ViewMyRequests />} />
                <Route path="/requests/:reference"                 element={<ViewRequestDetail />} />
                <Route path="/portal/:slug"                        element={<ViewFormsList />} />
                <Route path="/portal/:slug/new/:templateSlug"      element={<ViewDynamicForm />} />
                <Route path="/portal/:slug/requests"               element={<ViewMyRequests />} />
                <Route path="/portal/:slug/requests/:reference"    element={<ViewRequestDetail />} />
                <Route path="*"                                    element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </div>
    </ErrorBoundary>
  );
}
