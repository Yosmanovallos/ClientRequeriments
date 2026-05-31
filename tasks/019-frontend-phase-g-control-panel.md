# Task 019 — Phase G: Control Panel UI

**Phase:** G · **Status:** 🔲 TODO (after Tasks 017 + 018)

## Why
SuperAdmin and Admin need a back-office to manage users, projects, and form templates. The implementation plan has detailed wireframes (see `implementation_plan.md` § Control Panel — UI Design).

## Do
1. **`ViewControlPanel.tsx`** — sidebar shell with nav: Overview · Users · Projects · Forms · Audit Log (audit log is placeholder for later).
2. **`ViewCPOverview.tsx`** — dashboard. Cards: total users / projects / requests, pending approval count, recent activity.
3. **`ViewCPUsers.tsx`**:
   - Section 1: Pending approval list — each row has "Set Up →" button → opens setup modal
   - Section 2: Active users table — filter by role, search by email, click row to edit
   - Setup/edit modal: role radio + project checkboxes → PATCH /users/:id
4. **`ViewCPProjects.tsx`** — project cards with [Manage Members] [Configure Forms] [Edit] [Archive] actions
5. **`ViewCPProjectMembers.tsx`** — modal/sub-view for adding/removing project members
6. **`ViewCPForms.tsx`** — per-project: enabled forms list (toggle on/off) + "Create New Form" button
7. **`ViewCPFormBuilder.tsx`** — create/edit a custom FormTemplate:
   - Name + description
   - Field list with drag-to-reorder
   - Per-field: name, label, type dropdown, required toggle, options (for select), delete
   - Preview tab showing the rendered form
   - Save → POST/PATCH /form-templates
8. **🐛 Fix #8 (responsive CSS)**: media queries at 768px and 480px. Sidebar collapses to top nav on mobile.
9. Add `'controlpanel' | 'cp.overview' | 'cp.users' | 'cp.projects' | 'cp.forms' | 'cp.formbuilder'` to the View union.

## Definition of done
- [ ] SuperAdmin can see all clients/projects/users in the Control Panel
- [ ] Admin sees only their own client's data (server enforces; UI mirrors)
- [ ] Setup pending user → assign role + projects → they immediately see their project picker after refresh
- [ ] Create a custom form template → enable it in a project → it shows up in the project's form list
- [ ] Responsive: Control Panel usable on phone-sized screens
- [ ] Frontend tsc passes
