# Pocket Inspector — Full Requirement (Phase One: Internal MVP) — v3

## 0) Purpose
Build a structured, mobile-first inspection + certification platform that replaces the manual Dropbox upload flow.

Phase One focuses on:
- **Simple, fast capture** for inspectors
- **Admin end-to-end control** (admin sees everything immediately)
- **Bulk export** of images (door/floor/building/site) in structured ZIP
- **Certificate upload** at:
  - Door level (one certificate per door)
  - Building level (one certificate per building)
- **Notifications** to inspector when certificates are uploaded

---

## 1) Inspection structure (MANDATORY)
When creating an inspection, user selects Inspection Type:

### Option A — Building Inspection
`Building → Inspection → Floors → Doors → Photos`

### Option B — Site Inspection (Project)
`Site → Building(s) → Inspection → Floors → Doors → Photos`

---

## 2) Roles & access
### Admin (full control)
Admin has access to **everything end-to-end**:
- View all sites/buildings/inspections/floors/doors/assets
- See upload progress and counts (how many photos uploaded per door/floor/building)
- Download images (single, per door, per floor, per building, per site)
- Upload certificates:
  - per door (single file)
  - per building (single file)
- Manage users + assignments
- Trigger exports and download ZIPs

### Inspector
- Can create inspections (or receive admin assignments)
- Upload photos to doors
- Sees status updates and certificates
- Receives notifications when certificates are uploaded

---

## 3) Certificate rules (MANDATORY)
### 3.1 Door certificate (single)
- Admin can upload **one certificate per door**.
- Uploading the door certificate marks the **door as CERTIFIED**.

### 3.2 Building certificate (single)
- Admin can upload **one certificate per building** (overall building certificate).
- Building certificate should be uploaded **after** all doors are certified (recommended rule).

### 3.3 Completion logic
- A **door is completed** when its **door certificate** is uploaded by admin.
- A **building inspection is fully completed** when:
  1) **All doors** under the inspection are certified, AND
  2) **Building certificate** is uploaded (if required by the workflow)

(If building certificate is optional in some cases, keep a simple flag: `requiresBuildingCertificate`)

---

## 4) Mandatory fields (keep minimal)
- Site: `name` (required only if inspection type = SITE)
- Building: `name` (required always)
- Door: `code` (required always)
- Inspection: type = SITE or BUILDING (required)

Optional helpful fields:
- buildingCode, floorLabel, locationNotes

---

## 5) Mobile app requirements (Phase One)
### Inspector experience
- Create or open inspection
- Navigate: Building → Floor → Door
- Capture/upload multiple images per door (by role)
- See progress indicators:
  - Door: photos uploaded count + door certification status
  - Floor: doors certified count
  - Building: overall completion status
- Receive push notification when:
  - Door certificate uploaded
  - Building certificate uploaded

### Mobile UI status signals
- Door tile: ✅ “Certified” once door certificate exists
- Building header: shows “Building Certificate Available” once uploaded
- Report viewer: open/download certificate PDFs

---

## 6) Admin portal requirements (Phase One)
### Visibility & tracking (MANDATORY)
Admin must see:
- Upload counts:
  - photos per door
  - photos per floor (sum)
  - photos per building (sum)
- Door certification status:
  - NOT_CERTIFIED / CERTIFIED
- Building certificate status:
  - NOT_UPLOADED / UPLOADED

### Actions
- View thumbnails grouped by role
- Download:
  - single image
  - all images for door
  - all images for floor
  - all images for building
  - all images for site
- Upload certificates:
  - Door certificate (single)
  - Building certificate (single)
- Trigger bulk export jobs and download ZIP result

---

## 7) Backend/API requirements (Phase One)
### Must support
- Auth + role checks
- CRUD minimal for: site/building/inspection/floor/door
- Signed URLs for:
  - image upload/download
  - door certificate upload/download
  - building certificate upload/download
  - export ZIP download
- Register uploaded asset metadata
- Export job creation + status
- Notification trigger when certificates uploaded:
  - door certificate → notify assigned inspector(s)
  - building certificate → notify assigned inspector(s)

---

## 8) Notifications (Phase One)
Keep it simple:
- Use a push notification provider (e.g., FCM for Android + APNs via FCM for iOS, or any existing push setup).
- Store device tokens per user.
- Backend sends push when certificate uploaded.

---

## 9) Out of scope (Phase One)
- Public signup
- Hosting AI/automation pipeline
- Billing/credits
- Multi-region + CDN

---

## 10) Acceptance checklist (Phase One)
- Admin sees all uploads immediately with counts by door/floor/building
- Admin can download per floor and bulk building/site exports
- Admin can upload one certificate per door (marks door certified)
- Admin can upload one certificate per building (overall certificate)
- Mobile updates statuses and shows certificates
- Push notifications sent for door/building certificates
