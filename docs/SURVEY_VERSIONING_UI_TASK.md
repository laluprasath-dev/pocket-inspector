# Survey Versioning — Admin Portal UI Task Guide

> **For**: Admin Portal frontend developers  
> **Feature**: Survey Versioning & History  
> **Backend ref**: [`ADMIN_PANEL_INTEGRATION.md § 15`](./ADMIN_PANEL_INTEGRATION.md#15-module-survey-versioning)  
> **Base URL**: `https://pocket-inspector-api-34292529156.europe-west2.run.app`  
> **Auth**: All requests need `Authorization: Bearer <accessToken>` header

---

## What This Feature Does

A **survey** represents one complete inspection cycle for a building. The same building can be inspected multiple times per year (e.g. 4x per year in the UK). Each cycle is tracked as a numbered version — Survey v1, v2, v3 etc.

The lifecycle per survey:

```
Inspector uploads door photos
          ↓
Inspector submits each door (DRAFT → SUBMITTED)
          ↓
Admin uploads door certificates (SUBMITTED → CERTIFIED per door)
          ↓
Admin uploads building certificate (Building → CERTIFIED)
          ↓
Admin clicks "Confirm Survey Complete"  ← NEW BUTTON YOU ARE BUILDING
          ↓
Survey v1 → COMPLETED (frozen, read-only forever)
          ↓
Admin clicks "Start Next Survey"  ← NEW BUTTON YOU ARE BUILDING
          ↓
Survey v2 → ACTIVE (floors + doors cloned, no images/certs)
```

---

## UI Changes Overview

You are adding **2 new areas** to the existing Building Detail page:

1. **Survey status badge** in the building header
2. **"Survey History" tab** alongside the existing Floors/Doors tab
3. **Two action buttons** — "Confirm Survey Complete" and "Start Next Survey"
4. **Optional scheduling panel** when confirming completion

No new pages are needed — everything lives on the Building Detail page.

---

## Screen Layouts

### Building Detail Page — Updated Header

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Buildings   Block A — 14 High Street                          │
│                                                                   │
│  Status: [● CERTIFIED]   Survey: [v1 ACTIVE]                     │
│                                                                   │
│  [Edit Building]  [Upload Building Cert]  [Confirm Complete ✓]   │
└──────────────────────────────────────────────────────────────────┘
```

- The **Survey badge** `[v1 ACTIVE]` is always visible in the header
- **"Confirm Complete"** button only shows when conditions are met (see rules below)
- After survey is completed, show **"Start Next Survey →"** instead

---

### Survey History Tab

```
┌──────────────────────────────────────────────────────────────────┐
│  [Floors & Doors]   [Survey History]                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Survey v2  ●ACTIVE      Started: 01 Apr 2026                    │
│  3 floors · 12 doors · No cert yet           [View Current ›]    │
│                                                                   │
│  ──────────────────────────────────────────────────────          │
│                                                                   │
│  Survey v1  ✓COMPLETED   01 Jan → 20 Jan 2026                   │
│  3 floors · 12 doors · All certified · Cert uploaded             │
│  Confirmed by: Admin User                    [View History ›]    │
│                                                                   │
│  Survey v1 had next survey scheduled:                            │
│  📅 01 Apr 2026  👤 John Doe                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

### Survey History Detail View (Read-Only)

When the admin clicks **"View History ›"** on a completed survey:

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Survey History   Survey v1  ✓ COMPLETED                       │
│                                                                   │
│  🔒 This survey is completed and read-only.                      │
│                                                                   │
│  Period:    01 Jan 2026 → 20 Jan 2026                            │
│  Confirmed: Admin User · 20 Jan 2026 14:30                       │
│  Building cert: [Download PDF ↓]                                 │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│  Ground Floor                                                     │
│    D-001   ✓ CERTIFIED   5 images   Cert: Yes                    │
│    D-002   ✓ CERTIFIED   4 images   Cert: Yes                    │
│                                                                   │
│  First Floor                                                      │
│    D-101   ✓ CERTIFIED   6 images   Cert: Yes                    │
└──────────────────────────────────────────────────────────────────┘
```

No Edit / Delete / Upload buttons anywhere on this screen.

---

### Confirm Survey Complete — Dialog / Modal

When the admin clicks "Confirm Survey Complete":

```
┌──────────────────────────────────────────────────────────────────┐
│  Confirm Survey Complete                                    [✕]   │
│                                                                   │
│  You are confirming that Survey v1 for "Block A" is complete.    │
│  This action is permanent and cannot be undone.                  │
│                                                                   │
│  ── Schedule Next Survey (optional) ─────────────────────────   │
│                                                                   │
│  Next survey date   [  Pick a date...      ]                     │
│  Assign inspector   [  Select inspector ▼  ]                     │
│  Note (optional)    [  e.g. Focus on upper floors...  ]          │
│                                                                   │
│  [Cancel]                         [Confirm & Complete  →]        │
└──────────────────────────────────────────────────────────────────┘
```

---

### Start Next Survey — Dialog / Modal

```
┌──────────────────────────────────────────────────────────────────┐
│  Start Next Survey (v2)                                     [✕]   │
│                                                                   │
│  This will create Survey v2 for "Block A" by copying all floors  │
│  and doors from Survey v1. Images and certificates will NOT be   │
│  copied — inspectors must re-photograph everything.              │
│                                                                   │
│  Cloning:  3 floors  ·  12 doors                                 │
│                                                                   │
│  Notify inspector (optional)   [  Select inspector ▼  ]         │
│                                                                   │
│  [Cancel]                              [Start Survey v2  →]      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks (in order)

---

### Task 1 — Fetch current survey on building load

Every time the Building Detail page loads, fetch the current active survey in parallel with the building data.

**API call:**
```
GET /v1/buildings/:id/surveys/current
Authorization: Bearer <accessToken>
```

**Success response:**
```json
{
  "data": {
    "id": "survey_abc",
    "version": 2,
    "status": "ACTIVE",
    "startedAt": "2026-04-01T09:00:00Z",
    "floorCount": 3,
    "buildingCertificatePresent": false,
    "buildingCertificateUploadedAt": null
  }
}
```

**Handle 404:** If this returns `404`, it means all surveys are completed and the admin needs to start a new one. Set `currentSurvey = null` in state.

**Store in state:**
```ts
interface BuildingPageState {
  building: Building;
  currentSurvey: Survey | null;  // null = no active survey
}
```

**Use to render:**
- The survey badge `[v1 ACTIVE]` in the header
- Show/hide "Confirm Complete" and "Start Next Survey" buttons

---

### Task 2 — Survey badge in the building header

Show a small badge next to the building status.

**Rules:**
```
currentSurvey exists  → show "v{N} ACTIVE"  (green badge)
currentSurvey is null → show "No active survey"  (grey badge)
```

**Example component (React/TypeScript):**
```tsx
function SurveyBadge({ survey }: { survey: Survey | null }) {
  if (!survey) {
    return <Badge color="gray">No active survey</Badge>;
  }
  return (
    <Badge color="green">
      Survey v{survey.version} · ACTIVE
    </Badge>
  );
}
```

---

### Task 3 — "Confirm Survey Complete" button + modal

#### 3a. Button visibility rules

Show this button **only when ALL of the following are true:**

| Condition | How to check |
|---|---|
| Building cert has been uploaded | `building.status === "CERTIFIED"` |
| There is an active survey | `currentSurvey !== null` |
| All doors in this survey are CERTIFIED | All doors from `/buildings/:id/floors` + `/floors/:id/doors` have `status === "CERTIFIED"` |

> **Shortcut**: You can rely on the backend to enforce all these conditions — if the button is clicked early, the backend returns a clear `400` error message you can show as a toast. The button visibility rules are just for good UX — don't let users click a button that will obviously fail.

#### 3b. On button click — show the confirmation modal

The modal has two sections:
1. Confirmation warning (required)
2. Schedule next survey (optional, all 3 fields)

#### 3c. On modal submit — call the API

```
POST /v1/buildings/:id/surveys/confirm-complete
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "nextScheduledAt": "2026-06-01T09:00:00Z",  // optional — only if date was picked
  "nextScheduledNote": "Q2 annual inspection",  // optional
  "nextAssignedInspectorId": "user_abc"         // optional — only if inspector was selected
}
```

Send `{}` (empty body) if the admin skipped scheduling.

**On success (200):**
- Show toast: `"Survey v1 confirmed complete! ✓"`
- Set `currentSurvey = null` in state (survey is now COMPLETED)
- Refresh the survey history list
- Refresh the building (building.status may have changed)
- Close the modal

**On error (400):**
- Show the `message` field from the response as an error toast
- Keep the modal open

```ts
async function confirmComplete(buildingId: string, dto: ConfirmCompleteDto) {
  try {
    const res = await api.post(`/v1/buildings/${buildingId}/surveys/confirm-complete`, dto);
    showToast(`Survey v${res.data.version} confirmed complete!`, 'success');
    refreshBuilding();
    refreshSurveyHistory();
    setCurrentSurvey(null);
    closeModal();
  } catch (err) {
    showToast(err.response.data.message, 'error');
  }
}
```

---

### Task 4 — "Start Next Survey" button + modal

#### 4a. Button visibility rules

Show this button **only when:**
- `currentSurvey === null` (no active survey — the previous one is COMPLETED)

#### 4b. Pre-populate modal with survey history

Before showing the modal, fetch the last completed survey to show how many floors/doors will be cloned:

```
GET /v1/buildings/:id/surveys
```

Take the last entry where `status === "COMPLETED"` and show:
```
Cloning: {floorCount} floors · {doorCount calculated from detail} doors
```

Or simply call `GET /v1/buildings/:id/surveys/current` — if it returns 404, check the history list for the last completed survey's `floorCount`.

#### 4c. On modal submit — call the API

```
POST /v1/buildings/:id/surveys/start-next
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "assignedInspectorId": "user_abc"  // optional — only if inspector was selected
}
```

Send `{}` if no inspector was selected.

**On success (201):**
- Show toast: `"Survey v2 started! 3 floors and 12 doors have been cloned. ✓"`
  (use `response.data.floorsCloned` and `response.data.doorsCloned` from the response)
- Set `currentSurvey = response.data` in state
- Refresh building (building.status is now DRAFT)
- Refresh survey history list
- Switch to the Floors & Doors tab automatically
- Close the modal

**On error (400):**
```ts
} catch (err) {
  showToast(err.response.data.message, 'error');
}
```

---

### Task 5 — Survey History tab

#### 5a. Fetch the history list

```
GET /v1/buildings/:id/surveys
Authorization: Bearer <accessToken>
```

Returns an array sorted oldest first. Display newest first in the UI (reverse the array).

**Response shape:**
```json
[
  {
    "id": "survey_v1_id",
    "version": 1,
    "status": "COMPLETED",
    "startedAt": "2026-01-10T09:00:00Z",
    "completedAt": "2026-01-20T14:30:00Z",
    "createdBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
    "confirmedBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
    "buildingCertificatePresent": true,
    "buildingCertificateUploadedAt": "2026-01-19T11:00:00Z",
    "floorCount": 3,
    "nextScheduledAt": "2026-04-01T09:00:00Z",
    "nextScheduledNote": "Q2 annual inspection",
    "nextAssignedInspector": { "id": "...", "firstName": "John", "lastName": "Doe" }
  }
]
```

#### 5b. Render each survey row

For each survey in the list, show:

| Field | When to show |
|---|---|
| Version badge (`v1`, `v2`) | Always |
| Status badge (`ACTIVE` / `COMPLETED`) | Always |
| Date range `startedAt → completedAt` | Always |
| Floor count | Always |
| Building cert present indicator | Always |
| "Confirmed by" name | Only if `confirmedBy !== null` |
| Next scheduled date + assigned inspector | Only if `nextScheduledAt !== null` |
| "View History ›" button | Only if `status === "COMPLETED"` |
| "View Current ›" button | Only if `status === "ACTIVE"` |

#### 5c. Status badge colours

```
ACTIVE     → green  ●
COMPLETED  → blue/grey  ✓
```

---

### Task 6 — Survey History Detail View (Read-Only)

When the admin clicks "View History ›" on a completed survey, show a read-only detail panel or slide-over.

#### 6a. Fetch the survey detail

```
GET /v1/buildings/:id/surveys/:surveyId
Authorization: Bearer <accessToken>
```

**Response shape:**
```json
{
  "id": "...",
  "version": 1,
  "status": "COMPLETED",
  "startedAt": "...",
  "completedAt": "...",
  "confirmedBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
  "buildingCertificatePresent": true,
  "buildingCertificateUploadedAt": "...",
  "floors": [
    {
      "id": "...",
      "label": "Ground Floor",
      "doors": [
        {
          "id": "...",
          "code": "D-001",
          "status": "CERTIFIED",
          "imageCount": 5,
          "certificatePresent": true
        }
      ]
    }
  ]
}
```

#### 6b. Render rules for read-only view

- **Show** a prominent locked banner at the top: `"🔒 Survey v1 is completed and read-only"`
- **Hide ALL** Edit, Delete, Upload buttons throughout this view
- **Show** door status chips (`DRAFT` / `SUBMITTED` / `CERTIFIED`) as read-only text
- **Show** image count as text (not clickable upload button)
- **Show** cert present as a tick/cross indicator

#### 6c. Building certificate download button

If `buildingCertificatePresent === true`, show a "Download Building Certificate" button.

**On click:**
```
GET /v1/buildings/:id/surveys/:surveyId/certificate/signed-download
Authorization: Bearer <accessToken>
```

Response:
```json
{ "data": { "signedUrl": "https://storage.googleapis.com/...", "expiresAt": "..." } }
```

Open `signedUrl` in a new tab: `window.open(signedUrl, '_blank')`.

Do **not** cache this URL — always re-fetch on each click.

---

### Task 7 — Schedule Next Survey panel (optional)

This can be added as a standalone section on the Building Detail page for convenience, separate from the "Confirm Complete" modal.

```
PATCH /v1/buildings/:id/surveys/current/schedule
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "nextScheduledAt": "2026-06-01T09:00:00Z",
  "nextScheduledNote": "Q2 inspection",
  "nextAssignedInspectorId": "user_abc"
}
```

To clear a field, send `null`:
```json
{ "nextScheduledAt": null, "nextAssignedInspectorId": null }
```

Show this panel only when `currentSurvey !== null` (there's an active survey to attach the schedule to).

On success (200), refresh the survey history list to show the updated schedule.

---

## API Quick-Reference Card

| Action | Method | Endpoint | Role |
|---|---|---|---|
| Get current survey | `GET` | `/v1/buildings/:id/surveys/current` | Any |
| Get history list | `GET` | `/v1/buildings/:id/surveys` | Any |
| Get survey detail | `GET` | `/v1/buildings/:id/surveys/:surveyId` | Any |
| Download historical cert | `GET` | `/v1/buildings/:id/surveys/:surveyId/certificate/signed-download` | Any |
| Confirm survey complete | `POST` | `/v1/buildings/:id/surveys/confirm-complete` | **Admin only** |
| Start next survey | `POST` | `/v1/buildings/:id/surveys/start-next` | **Admin only** |
| Update schedule | `PATCH` | `/v1/buildings/:id/surveys/current/schedule` | **Admin only** |

---

## State Machine — What to Show and When

```
┌──────────────────────────────────────────────────────────────────┐
│  New building (no floors yet)                                    │
│  currentSurvey = null (404 from /current)                        │
│  historyList = []                                                │
│                                                                  │
│  → Show: "Add Floor" button (will auto-create Survey v1)        │
│  → Hide: "Confirm Complete", "Start Next Survey"                 │
└──────────────────────────────────────────────────────────────────┘
              ↓  (first floor added)
┌──────────────────────────────────────────────────────────────────┐
│  Survey v1 ACTIVE  (auto-created by backend)                     │
│  currentSurvey = { version: 1, status: "ACTIVE", ... }          │
│  building.status = DRAFT                                         │
│                                                                  │
│  → Show: Survey badge "v1 ACTIVE"                               │
│  → Show: Normal Floors & Doors tab (editable)                   │
│  → Show: Schedule Next Survey panel (optional)                  │
│  → Hide: "Confirm Complete" (not CERTIFIED yet)                 │
│  → Hide: "Start Next Survey" (active survey exists)             │
└──────────────────────────────────────────────────────────────────┘
              ↓  (inspector submits doors, admin uploads certs)
┌──────────────────────────────────────────────────────────────────┐
│  building.status = CERTIFIED  (building cert uploaded)           │
│  All doors = CERTIFIED                                           │
│                                                                  │
│  → Show: "Confirm Survey Complete" button  ← UNLOCKED           │
└──────────────────────────────────────────────────────────────────┘
              ↓  (admin confirms)
┌──────────────────────────────────────────────────────────────────┐
│  Survey v1 COMPLETED                                             │
│  currentSurvey = null  (404 from /current)                       │
│  building.status = CERTIFIED (unchanged)                         │
│                                                                  │
│  → Show: "Start Next Survey" button  ← UNLOCKED                 │
│  → Show: History tab with v1 COMPLETED row                      │
│  → Hide: "Confirm Complete"                                      │
└──────────────────────────────────────────────────────────────────┘
              ↓  (admin starts next survey)
┌──────────────────────────────────────────────────────────────────┐
│  Survey v2 ACTIVE                                                │
│  building.status = DRAFT  (reset by backend)                    │
│                                                                  │
│  → Show: Survey badge "v2 ACTIVE"                               │
│  → History tab shows: v2 ACTIVE + v1 COMPLETED (read-only)      │
│  → All floors/doors from v1 are cloned, status = DRAFT          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Error Handling Reference

All errors follow this format:
```json
{
  "statusCode": 400,
  "message": "Human-readable error message",
  "error": "Bad Request"
}
```

Show `message` directly in a toast or inline error on the UI.

| Error | User-friendly display |
|---|---|
| `"The building certificate must be uploaded before a survey can be confirmed complete"` | Show toast with this message |
| `"All doors must be CERTIFIED before confirming survey completion. Doors not yet certified: D-001, D-003"` | Show toast with this message — the door codes are included |
| `"A survey (v1) is already active for this building. Complete it before starting a new one."` | Show toast with this message |
| `403 Forbidden` | Show: "You do not have permission to perform this action." |
| `404 Not Found` (on `/current`) | Expected — means no active survey. Set `currentSurvey = null` |
| `404 Not Found` (on detail) | Show: "Survey not found." |

---

## Data Fetching Strategy

### On Building Detail page load (parallel fetches)

```ts
const [building, currentSurvey, surveyHistory] = await Promise.allSettled([
  api.get(`/v1/buildings/${buildingId}`),
  api.get(`/v1/buildings/${buildingId}/surveys/current`),  // 404 = null
  api.get(`/v1/buildings/${buildingId}/surveys`),
]);
```

### After "Confirm Complete" succeeds

Refresh these in order:
1. `GET /v1/buildings/:id` — building.status may have changed
2. `GET /v1/buildings/:id/surveys` — history list now shows COMPLETED
3. Set `currentSurvey = null` locally (no need to re-fetch — the response confirms it)

### After "Start Next Survey" succeeds

Refresh these:
1. `GET /v1/buildings/:id` — building.status is now DRAFT
2. `GET /v1/buildings/:id/surveys` — history shows new v2 ACTIVE
3. `GET /v1/buildings/:id/floors` — now returns floors from the new survey
4. Set `currentSurvey = response.data` from the start-next response

### After "Schedule Next" succeeds

Refresh:
1. `GET /v1/buildings/:id/surveys` — shows updated schedule fields

---

## Implementation Checklist

Use this to track progress:

- [ ] **Task 1** — Fetch current survey on page load; store in state
- [ ] **Task 2** — Survey badge in building header
- [ ] **Task 3a** — "Confirm Complete" button with visibility rules
- [ ] **Task 3b** — Confirm Complete modal with optional scheduling form
- [ ] **Task 3c** — POST confirm-complete, toast on success/error, refresh state
- [ ] **Task 4a** — "Start Next Survey" button with visibility rules
- [ ] **Task 4b** — Start Next Survey modal with clone preview
- [ ] **Task 4c** — POST start-next, toast on success/error, refresh state + switch to Floors tab
- [ ] **Task 5a** — Survey History tab: fetch and display history list
- [ ] **Task 5b** — Survey row component with all fields
- [ ] **Task 5c** — Status badge colours
- [ ] **Task 6a** — Survey History Detail: fetch survey detail by ID
- [ ] **Task 6b** — Read-only detail view with locked banner, no edit buttons
- [ ] **Task 6c** — Download historical building cert button
- [ ] **Task 7** *(optional)* — Schedule Next Survey panel on building detail

---

## Notes for Frontend Developers

1. **Never show Edit/Delete/Upload on a completed survey.** The backend will reject these with `403`, but don't make admins click something that will fail. Check `survey.status === "COMPLETED"` and hide mutation controls entirely.

2. **The building.status field reflects the CURRENT active survey state.** After `start-next` is called, `building.status` resets to `DRAFT`. After `confirm-complete`, it stays at `CERTIFIED`. Always re-fetch the building after either of these actions.

3. **GET /buildings/:id/floors always returns floors for the active survey only.** You do not need to pass a surveyId — the backend automatically scopes it. To see floors from a historical survey, use the survey detail endpoint `GET /buildings/:id/surveys/:surveyId` which includes floors inline.

4. **Survey v1 is automatically created when the first floor is added to a brand-new building.** You don't need to explicitly create it. Just call `POST /v1/floors` as normal.

5. **The confirm-complete endpoint is idempotent on errors** — calling it when conditions aren't met returns a `400` with a clear message and does not change any data. Safe to retry.

6. **The inspector picker in the scheduling form** should use the existing `GET /v1/users?role=INSPECTOR` (or `GET /v1/users` filtered client-side) to populate the dropdown. The user endpoint already exists — no new endpoint needed.

7. **Signed download URLs expire.** Always call the download endpoint fresh when the user clicks "Download/View". Never store or cache signed URLs between sessions.
