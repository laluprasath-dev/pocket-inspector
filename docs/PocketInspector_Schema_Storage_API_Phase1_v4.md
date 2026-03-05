# Pocket Inspector — Schema + Storage + API Outline (Phase One) — v4 (Progress + Certificates)

This version adds a **simple step-by-step progress model** without making Phase One complicated.

---

## 1) Simple progress model (Phase One)
### DoorStatus (single source of truth)
- **DRAFT** — inspector is still uploading images
- **SUBMITTED** — inspector confirmed “this door’s images are complete”
- **CERTIFIED** — admin uploaded the door certificate (door is completed)

(Keep it simple: **no IN_REVIEW** in Phase One.)

### Completion rules
- Door is completed when: `DoorStatus = CERTIFIED`
- Floor progress: count doors CERTIFIED vs total
- Building progress: count doors CERTIFIED vs total
- Building overall certificate: uploaded after all doors are certified (recommended)

---

## 2) Entities (supports Site + Building + Certificates)
- Org
- Users (ADMIN/INSPECTOR)
- Site (optional)
- Building (always)
- Inspection (SITE or BUILDING)
- Floor
- Door (has DoorStatus)
- DoorImage (many)
- DoorCertificate (single per door)
- BuildingCertificate (single per building)
- BulkExportJob (async ZIP)

---

## 3) Minimal DB schema (Phase One)

### sites
- id, orgId
- name (mandatory)
- referenceCode? , locationNotes?
- createdAt

### buildings
- id, orgId, siteId? (nullable)
- name (mandatory)
- buildingCode? , locationNotes?
- createdAt

### inspections
- id, orgId
- type: 'SITE'|'BUILDING'
- siteId? (required if type=SITE)
- buildingId? (required if type=BUILDING)
- status: 'ACTIVE'|'ARCHIVED'
- createdBy, createdAt

### inspection_assignments
- id, inspectionId, inspectorId
- status: 'PENDING'|'ACCEPTED'|'DECLINED'
- adminNote? , inspectorNote?
- createdAt, respondedAt?

### floors
- id, buildingId
- label?  (e.g., 'G','1','B1')
- notes?
- createdAt

### doors
- id, floorId
- code (mandatory)
- locationNotes?
- status: 'DRAFT'|'SUBMITTED'|'CERTIFIED'
- submittedAt? , submittedBy?
- certifiedAt? , certifiedBy?   (admin)
- createdAt

### door_images
- id, doorId
- role (enum, recommended)
- objectPathOriginal
- objectPathThumb? (optional but recommended)
- uploadedBy, uploadedAt

### door_certificates (one per door)
- id, doorId (unique)
- objectPathCertificate
- uploadedBy (adminId)
- uploadedAt

### building_certificates (one per building)
- id, buildingId (unique)
- objectPathCertificate
- uploadedBy (adminId)
- uploadedAt

### user_device_tokens (for notifications)
- id, userId
- platform: 'IOS'|'ANDROID'
- token
- createdAt
- lastSeenAt?

### bulk_export_jobs
- id, orgId
- targetType: 'DOOR'|'FLOOR'|'BUILDING'|'SITE'|'INSPECTION'
- targetId
- status: 'QUEUED'|'RUNNING'|'DONE'|'FAILED'
- objectPathZip?
- createdBy, createdAt
- error?

---

## 4) Storage architecture (GCS paths) — London bucket
Private bucket in europe-west2 (London). Signed URLs only.

### Site-based objects
orgs/{orgId}/sites/{siteId}/buildings/{buildingId}/floors/{floorId}/doors/{doorId}/
  images/original/{role}/{imageId}.jpg
  images/thumb/{role}/{imageId}.jpg
  certificates/door/{doorCertificateId}.pdf

orgs/{orgId}/sites/{siteId}/buildings/{buildingId}/
  certificates/building/{buildingCertificateId}.pdf

### Standalone building objects
orgs/{orgId}/buildings/{buildingId}/floors/{floorId}/doors/{doorId}/...

### Export ZIPs
exports/{orgId}/{targetType}/{targetId}/{jobId}.zip

---

## 5) Bulk export ZIP structure (simple + predictable)
Building_{buildingName}/
  Floor_{label}/
    Door_{code}/
      front/ ...
      back/ ...
      certificates/
        door_certificate.pdf  (if present)

Building_{buildingName}/
  certificates/
    building_certificate.pdf (if present)

(For site export, wrap with Site_{siteName}/ and include each building.)

---

## 6) Signed URL flows (Phase One)
### Upload image (inspector)
1) App → API: request signed upload URL (doorId + role)
2) App uploads directly to GCS
3) App → API: register image metadata

### Submit door (inspector)
- App → API: `POST /doors/{id}/submit`
- Backend checks: at least 1 image exists (simple rule)
- Sets door status → **SUBMITTED**

### Upload door certificate (admin)
1) Admin → API: request signed upload URL
2) Upload to GCS
3) Admin → API: register certificate
4) Backend sets door status → **CERTIFIED**
5) Backend sends notification to inspector(s)

### Upload building certificate (admin)
Same pattern, then notify inspector(s).

---

## 7) API outline (Phase One)

### Doors & progress
- POST /doors/{id}/submit
  - sets status to SUBMITTED

- GET /doors/{id}
  - includes:
    - status
    - image count
    - door certificate present?
    - signed thumbnail URLs (optional: request per image)

### Images
- POST /doors/{id}/images/signed-upload
- POST /doors/{id}/images/register

### Door certificate
- POST /doors/{id}/certificate/signed-upload
- POST /doors/{id}/certificate/register
- GET  /doors/{id}/certificate/signed-download

### Building certificate
- POST /buildings/{id}/certificate/signed-upload
- POST /buildings/{id}/certificate/register
- GET  /buildings/{id}/certificate/signed-download

### Lists
- GET /buildings
- GET /buildings/{id}/floors
- GET /floors/{id}/doors
  - include counts:
    - imagesCount
    - status
    - certificatePresent?

### Bulk export
- POST /exports { targetType, targetId }
- GET  /exports/{jobId}
- GET  /exports/{jobId}/signed-download

### Notifications
- POST /me/device-token { platform, token }

---

## 8) UI statuses (Phase One, simple)
### Mobile
- Door: DRAFT → SUBMITTED → CERTIFIED ✅
- Building certificate: show “Available” when uploaded

### Admin
- Show image count per door
- Show door status badge
- Upload door certificate action (enabled when SUBMITTED)
- Upload building certificate action (enabled when all doors CERTIFIED)

---

## 9) Keep Phase One simple (rules)
- Only site/building name required; door code required
- Door submit rule: at least 1 photo uploaded
- No advanced workflow states; no AI automation
- Everything should be easy to understand at a glance
