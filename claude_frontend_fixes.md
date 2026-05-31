# Frontend Role-Based Flows & Control Panel Fixes

## 📌 Context for Claude Code
The backend has successfully implemented Role-Based Access Control (RBAC) and Project Isolation logic (Phases A-D). However, the frontend is severely lagging behind. Currently:
- The UI treats all users as having identical access.
- Critical bugs prevent proper login and navigation (`AppContext` fails to persist the session).
- The Control Panel (`admin` views) is a placeholder, which is why the Super Admin cannot access or see anything inside the back-office.
- The project isolation is not reflected in the UI.

Follow this step-by-step guide to implement Phase E (Roles & Navigation), Phase F (Dynamic Forms), and Phase G (Control Panel) to fix these issues.

## ⚠️ Architectural Rules & Correct Practices
Before implementing, ensure you adhere to the following rules from `CLAUDE.md`:
1. **Source of Truth:** The backend is the absolute source of truth for roles and permissions. The frontend should only mirror these permissions for UX purposes (e.g., hiding the Control Panel link for Clients/Agents).
2. **Context Extension:** `UserSession` inside `AppContext.tsx` must be extended to include `role` and `projects`.
3. **No Mocks or Hardcoding:** Delete the 5 hardcoded form components and replace them entirely with the single dynamic form renderer. 
4. **Responsiveness:** Ensure that the Control Panel and its internal components are fully responsive and usable on mobile devices using CSS media queries.

---

## 🛠️ Step-by-Step Implementation Guide

### Step 1: Fix Blocking Login Bugs (Phase E)
*Files:* `frontend/src/context/AppContext.tsx`, `frontend/src/views/ViewLogin.tsx`

1. **Bug #1 (Login State missing):** In `ViewLogin.tsx`, the `handleLogin` function calls `auth.signIn()` but never sets the global user state. Since `AppContext.tsx` already exposes `setUser`, you must call `setUser(session)` upon successful login *before* calling `go()`.
2. **Bug #2 (Navigation Guard):** Fix the early-return guard in `AppContext.tsx`'s `go()` method. If the view is unauthenticated, its default view should be `'login'` rather than `'portal'`.
3. **Extend Auth Context:** Update `UserSession` to include `role` and `projects`. When `auth.signIn` succeeds, immediately fetch `GET /users/me` to get the latest role and project assignments.

### Step 2: Implement Role-Based Routing & Pending Flow (Phase E)
*Files:* `frontend/src/views/ViewPendingApproval.tsx`, `frontend/src/views/ViewProjectPicker.tsx`

1. **Pending Users:** If a user logs in and `user.role === null`, automatically route them to a new `ViewPendingApproval` component. They should see a message indicating their account is pending admin approval and a Logout button. They must not have access to any other views.
2. **Project Picker:** For users with an approved role, route them to `ViewProjectPicker.tsx`. This view must fetch `GET /projects` and display *only* the projects they are assigned to.
3. **Top Navigation (Control Panel Access):** Modify the TopNav avatar dropdown to conditionally render the "Control Panel" link **only** if `user.role === 'ADMIN'` or `user.role === 'SUPER_ADMIN'`.

### Step 3: Implement the Control Panel (Phase G)
*Files:* `frontend/src/views/admin/*`

Currently, `ViewControlPanel.tsx` is just a shell with placeholders for anything other than `overview`. You must build out the missing admin components:
1. **Users Management (`ViewCPUsers.tsx`):**
   - Fetch pending users via `GET /users/pending`. Display a "Set Up" button next to each.
   - The setup modal must allow assigning a Role and Projects, then submit via `PATCH /users/:id/role` and `PATCH /users/:id/projects`.
   - Display a table of all active users with filters.
2. **Projects Management (`ViewCPProjects.tsx` & `ViewCPProjectMembers.tsx`):**
   - List all projects and provide CRUD capabilities.
   - Build a sub-view to add or remove members from projects.
3. **Forms Management (`ViewCPForms.tsx` & `ViewCPFormBuilder.tsx`):**
   - List enabled forms per project.
   - Build a Form Builder interface to allow SuperAdmins to create/edit custom templates via a field list editor. Submits via `POST /form-templates`.

### Step 4: Build Dynamic Form Renderer (Phase F)
*Files:* `frontend/src/views/ViewDynamicForm.tsx`, `frontend/src/views/DynamicField.tsx`

1. **Dynamic Renderer:** Create `ViewDynamicForm.tsx` to accept a `FormTemplate` object and parse its `fieldSchema` JSON string.
2. **Dynamic Fields:** Create `DynamicField.tsx` to loop through the parsed schema and conditionally render `<input>`, `<textarea>`, or `<select>` depending on the field type.
3. **Submission:** Submitting the dynamic form must trigger a `POST /requests` request, passing the `projectId`, `templateId`, and packaging the user's answers into the `payload` JSON.
4. **Cleanup:** Delete the outdated 5 hardcoded form views (`ViewForm.tsx`, `ViewFormNewPage.tsx`, etc.). Combine `ViewRequests` and `ViewRequestsList` to eliminate redundant code.

### Step 5: UX & Error Handling Polish
1. **Loaders:** Add `<LoadingSpinner>` to components like `ViewRequestsList` or Control Panel views while waiting for API responses.
2. **Error Boundaries:** Wrap the `<Router>` in `App.tsx` with a React `<ErrorBoundary>` so failures don't crash the entire app silently into a white screen.
3. **Mobile CSS:** Add media queries to `index.css` (e.g., 768px breakpoints) so that the Control Panel's sidebar gracefully collapses to a mobile-friendly view.
