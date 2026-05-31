# Task 018 — Phase F: Dynamic form renderer

**Phase:** F · **Status:** 🔲 TODO (after Task 017)

## Why
Replace the 5 hardcoded form views with a single component that renders any `FormTemplate.fieldSchema`. Adding a new form type becomes a backend-only operation (create a template via Control Panel; no code change).

## Do
1. **`ViewDynamicForm.tsx`** — props: `{ template: FormTemplate, projectId: string }`. Parses `fieldSchema` and renders fields in `sortOrder`.
2. **`DynamicField.tsx`** — renders the right input for each type:
   - `text` / `email` / `number` → `<input>`
   - `textarea` → `<textarea>`
   - `select` → `<select>` with `options`
   - `date` → `<input type="date">`
   Handles `required`, `placeholder`. Tracks value in a local state map keyed by `field.name`.
3. **Submit** → POST `/requests` with body `{ projectId, templateId, requestType: template.slug, title, priority, dueDate, payload: {/* keyed by field.name */} }`.
   - Title derivation: use a configurable "title field" from the template (default: first `text` field, fall back to `template.name`).
   - Priority: use the `priority` field if present, default `Medium`.
   - DueDate: use the `dueDate` field if present, else null.
   - Everything else goes into `payload`.
4. **Validation**: client-side only (required field check + email/number type validation). Server is still authoritative.
5. **AttachmentsPicker** — reuse the existing component below the dynamic fields (uploads after request creation, same as current).
6. **Wire into router**: Phase E sets `activeProject`. Click a form card → load the template via `GET /form-templates/:id` → render `<ViewDynamicForm template={…} projectId={activeProject.id} />`.
7. **Delete the 5 hardcoded form views** (`ViewForm.tsx`, `ViewFormNewPage.tsx`, etc.) once the dynamic flow works for all of them. Keep a fallback flag to revert if needed.
8. **🐛 Fix #9**: Consolidate `ViewRequests` and `ViewRequestsList` into a single component. Remove dead code.

## Definition of done
- [ ] Can submit a request through `ViewDynamicForm` for each of the 5 standard templates
- [ ] Result is byte-identical to what the old hardcoded forms produced (payload-wise)
- [ ] All 5 hardcoded form view files deleted
- [ ] `ViewRequests` consolidated into `ViewRequestsList`
- [ ] Frontend tsc passes
- [ ] Live test: create a custom template via API → it appears in the project's form list → submit a request through it
