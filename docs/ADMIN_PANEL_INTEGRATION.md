# Pocket Inspector — Admin Panel Integration Guide

> **Audience**: Front-end engineers building the Admin Portal.  
> **Phase**: One (Internal MVP)  
> **Base docs**: See [`PocketInspector_FullRequirement_Phase1_v3.md`](./PocketInspector_FullRequirement_Phase1_v3.md) and [`PocketInspector_Schema_Storage_API_Phase1_v4.md`](./PocketInspector_Schema_Storage_API_Phase1_v4.md) for full product context.  
> **Mobile reference**: [`MOBILE_CLIENT_DETAILS_INTEGRATION.md`](./MOBILE_CLIENT_DETAILS_INTEGRATION.md)
> **Quick role sheet**: [`CURRENT_ACTIVE_ENDPOINTS_BY_ROLE.md`](./CURRENT_ACTIVE_ENDPOINTS_BY_ROLE.md)

---

## Table of Contents

1. [Environment & Base URL](#1-environment--base-url)
2. [Authentication](#2-authentication)
3. [API Conventions](#3-api-conventions)
4. [Enums Reference](#4-enums-reference)
5. [Module: Organisation](#5-module-organisation)
6. [Module: Users](#6-module-users)
7. [Module: Clients](#7-module-clients)
8. [Module: Sites](#8-module-sites)
9. [Module: Buildings](#9-module-buildings)
10. [Module: Floors](#10-module-floors)
11. [Module: Doors](#11-module-doors)
12. [Module: Door Images](#12-module-door-images)
13. [Module: Certificates (Door & Building)](#13-module-certificates-door--building)
14. [Legacy Inspections Module Removed](#14-legacy-inspections-module-removed)
15. [Module: Exports (Bulk ZIP)](#15-module-exports-bulk-zip)
16. [Module: Survey Versioning](#16-module-survey-versioning)
17. [Signed URL Pattern — How it Works](#17-signed-url-pattern--how-it-works)
18. [Signed URL Refresh Strategy](#18-signed-url-refresh-strategy)
19. [Mobile App: Show Client Details](#19-mobile-app-show-client-details)
20. [Admin-only vs Shared Endpoints](#20-admin-only-vs-shared-endpoints)
21. [Postman Collection](#21-postman-collection)

---

## 1. Environment & Base URL

| Environment | Base URL |
|---|---|
| Local dev | `http://localhost:3001` |
| Production | `https://pocket-inspector-api-34292529156.europe-west2.run.app` |

All API routes are versioned under `/v1/`:

```
GET  https://pocket-inspector-api-.../v1/buildings
POST https://pocket-inspector-api-.../v1/auth/login
```

**Swagger UI** (local dev only): `http://localhost:3001/api/docs`

Use the Swagger tag `admin-portal` for the admin-only and admin-primary endpoint view. The same split is mirrored in Postman under `🖥️ Admin Portal Endpoints`.

---

## 2. Authentication

### 2.1 Login

```
POST /v1/auth/login
```

**Request body**

```json
{
  "email": "admin@example.com",
  "password": "your-password",
  "deviceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "deviceName": "Admin Portal Chrome",
  "deviceType": "web"
}
```

> `deviceId` — generate once per browser/device, persist in `localStorage`. It identifies the session for revocation. `deviceType` should be `"web"` for the admin portal.

**Response**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900
  }
}
```

Store both tokens. The access token expires in **15 minutes**. The refresh token is valid for **7 days**.

### 2.2 Refresh Token

```
POST /v1/auth/refresh
```

```json
{ "refreshToken": "eyJ..." }
```

Returns a new `{ accessToken, refreshToken, expiresIn }`. Call this **before** the access token expires or when you receive a `401`.

### 2.3 Attach Token to Requests

Add the access token to every authenticated request:

```
Authorization: Bearer <accessToken>
```

### 2.4 Get Current User

```
GET /v1/auth/me
```

Returns the logged-in user object (id, email, role, orgId, firstName, lastName).

### 2.5 Logout

```
POST /v1/auth/logout
```

Revokes the current device session. No body needed.

### 2.6 Session Management

```
GET    /v1/auth/sessions                         — list all active device sessions
DELETE /v1/auth/sessions/:id                     — revoke a specific session
DELETE /v1/auth/sessions?keepCurrent=true        — revoke all other sessions
```

---

## 3. API Conventions

### Response envelope

Every successful response is wrapped:

```json
{
  "data": { ... }
}
```

Arrays are returned as:

```json
{
  "data": [ ... ]
}
```

### Error responses

```json
{
  "statusCode": 404,
  "message": "Door not found",
  "error": "Not Found"
}
```

### HTTP status codes used

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `204` | No content (deletes, logout) |
| `400` | Validation error |
| `401` | Missing / expired token |
| `403` | Insufficient role |
| `404` | Resource not found |

---

## 4. Enums Reference

Use these exact string values in request bodies.

| Enum | Values |
|---|---|
| `Role` | `ADMIN`, `INSPECTOR` |
| `AssignmentStatus` | `PENDING`, `ACCEPTED`, `DECLINED` |
| `DoorStatus` | `DRAFT`, `SUBMITTED`, `CERTIFIED` |
| `ImageRole` | `FRONT_FACE`, `REAR_FACE`, `FRAME_GAP`, `INTUMESCENT_STRIP`, `SELF_CLOSER`, `HINGES`, `SIGNAGE`, `OTHER` |
| `DevicePlatform` | `IOS`, `ANDROID` |
| `ExportTargetType` | `DOOR`, `FLOOR`, `BUILDING`, `SITE` |
| `ExportStatus` | `QUEUED`, `RUNNING`, `DONE`, `FAILED` |
| `SurveyStatus` | `ACTIVE`, `COMPLETED` |

UI/product wording uses `Photographer`, but the current API contract still uses the existing role value `INSPECTOR` and fields like `inspectorId`.

---

## 5. Module: Organisation

### Get my organisation

```
GET /v1/orgs/me
```

Returns org details (id, name).

### Update organisation name *(admin only)*

```
PATCH /v1/orgs/me
```

```json
{ "name": "Pocket Inspection Ltd" }
```

---

## 6. Module: Users

### List all users *(admin only)*

```
GET /v1/users
```

Returns all users in your org.

### Create a user *(admin only)*

```
POST /v1/users
```

```json
{
  "email": "photographer@example.com",
  "password": "securepassword123",
  "role": "INSPECTOR",
  "firstName": "Jane",
  "lastName": "Doe"
}
```

> Use this to onboard new admins or photographers. There is no public signup — all accounts are created internally.

### Get a user by ID

```
GET /v1/users/:id
```

Admin can get any user. A photographer can only get their own profile.

### Update a user

```
PATCH /v1/users/:id
```

```json
{
  "firstName": "Jane",
  "lastName": "Smith"
}
```

Admin can update any user. A photographer can only update themselves.

---

## 7. Module: Clients

Clients are managed at org level and can be reused across multiple sites and standalone buildings.

### Business rules

- Only `ADMIN` can create/update/delete clients.
- `name` is required and must be unique within an org.
- One client can be linked to many sites and many standalone buildings.
- If a building has a `siteId`, do not assign client directly to that building; assign client to the site.

### List clients *(admin only)*

```
GET /v1/clients
```

### Create client *(admin only)*

```
POST /v1/clients
```

```json
{
  "name": "Acme Fire Safety Ltd",
  "contactName": "John Smith",
  "contactEmail": "john@acme.com",
  "contactPhone": "+44 20 7946 0958",
  "address": "123 King Street, London EC2V 8AA",
  "notes": "Monthly billing"
}
```

Only `name` is mandatory.

### Get client by ID *(admin only)*

```
GET /v1/clients/:id
```

Returns client profile plus linked `sites[]` and `buildings[]` references.

### Update client *(admin only)*

```
PATCH /v1/clients/:id
```

### Delete client *(admin only)*

```
DELETE /v1/clients/:id
```

Returns `204 No Content`.

---

## 8. Module: Sites

Sites are optional top-level containers for groups of buildings. In the current system, survey planning and assignment happen through building workflows rather than a standalone `SITE` inspection endpoint.

### List sites

```
GET /v1/sites
```

Admin sees all sites. Photographers see only their own or assigned sites.

### Create a site

```
POST /v1/sites
```

```json
{
  "name": "London Portfolio 2025",
  "referenceCode": "SITE-001",
  "locationNotes": "Near Tower Bridge, SE1",
  "clientId": "client_123"
}
```

Only `name` is required. `clientId` is optional.

### Get a site

```
GET /v1/sites/:id
```

Site responses include optional client info:

```json
{
  "id": "site_123",
  "name": "London Portfolio 2025",
  "clientId": "client_123",
  "client": { "id": "client_123", "name": "Acme Fire Safety Ltd" }
}
```

### Update a site *(admin only)*

```
PATCH /v1/sites/:id
```

```json
{ "name": "Updated Name", "clientId": "client_123" }
```

Pass `{ "clientId": null }` to unlink a client from the site.

### Delete a site *(admin only)*

```
DELETE /v1/sites/:id
```

Returns `204 No Content`.

---

## 9. Module: Buildings

### List buildings

```
GET /v1/buildings
GET /v1/buildings?siteId=<siteId>    — filter by site
```

Admin sees all. Photographers see own + assigned.

Client mapping rules for buildings:
- Standalone building (`siteId = null`): may set `clientId`.
- Building linked to a site (`siteId != null`): must not set `clientId` directly.
- If linked to a site, assign the client on the site (`PATCH /v1/sites/:id`) instead.

### Create a building

```
POST /v1/buildings
```

```json
{
  "name": "Block A",
  "buildingCode": "BLD-001",
  "locationNotes": "Corner of King St",
  "siteId": "<optional-site-id>",
  "clientId": "<optional-client-id>"
}
```

Only `name` is required.

> If `siteId` is provided, do **not** send `clientId`. The API returns `400` for that combination.

### Get a building

```
GET /v1/buildings/:id
```

### Update a building *(admin only)*

```
PATCH /v1/buildings/:id
```

```json
{ "name": "Block B", "locationNotes": "Updated notes", "clientId": "client_123" }
```

Pass `{ "clientId": null }` to unlink a client from a standalone building.

### List floors of a building

```
GET /v1/buildings/:id/floors
```

### Building status

`GET /v1/buildings/:id` now returns status fields alongside the certificate info:

```json
{
  "id": "...",
  "name": "Block A",
  "siteId": null,
  "clientId": "client_123",
  "client": { "id": "client_123", "name": "Acme Fire Safety Ltd" },
  "buildingCode": "BLD-001",
  "status": "APPROVED",
  "approvedAt": "2026-03-10T10:00:00.000Z",
  "approvedById": "user123",
  "certifiedAt": null,
  "certifiedById": null,
  "certificatePresent": false,
  "certificateUploadedAt": null
}
```

> Use `status` to drive UI badges in the building section: `DRAFT` → `APPROVED` → `CERTIFIED ✅`  
> Show a **"Photographer Approved"** badge when `status === 'APPROVED'` and a **"Certified ✅"** badge when `status === 'CERTIFIED'`.  
> Hide the "Upload Certificate" button until `status === 'APPROVED'` or `status === 'CERTIFIED'`.  
> Show the "Download Certificate" button only when `certificatePresent === true`.

### Approve a building *(photographer action — shown for completeness)*

```
POST /v1/buildings/:id/approve
```

Sets building status from `DRAFT` → `APPROVED`. This is a **photographer** action — the admin panel does not need to call this endpoint, but the admin can **display the current `status`** to show whether the photographer has approved the building. Until the photographer approves, the admin's "Upload Certificate" button should be disabled or hidden.

---

## 10. Module: Floors

### Create a floor

```
POST /v1/floors
```

```json
{
  "buildingId": "<buildingId>",
  "label": "G",
  "notes": "Ground floor, main entrance"
}
```

### Get a floor

```
GET /v1/floors/:id
```

### Update a floor *(admin only)*

```
PATCH /v1/floors/:id
```

```json
{ "label": "1", "notes": "First floor" }
```

### Delete a floor *(admin only)*

```
DELETE /v1/floors/:id
```

Returns `204 No Content`.

### List doors on a floor

```
GET /v1/floors/:id/doors
```

Returns each door with `status`, `imageCount`, `certificatePresent`.

---

## 11. Module: Doors

### Create a door

```
POST /v1/doors
```

```json
{
  "floorId": "<floorId>",
  "code": "D-101",
  "locationNotes": "End of corridor, left side"
}
```

### Get a door

```
GET /v1/doors/:id
```

**Response includes**:

```json
{
  "data": {
    "id": "...",
    "floorId": "...",
    "code": "D-101",
    "status": "SUBMITTED",
    "locationNotes": "End of corridor",
    "imageCount": 5,
    "certificatePresent": false,
    "submittedAt": "2026-03-09T10:00:00.000Z",
    "certifiedAt": null,
    "createdAt": "2026-03-01T09:00:00.000Z"
  }
}
```

> Use `status` to drive UI badges: `DRAFT` → `SUBMITTED` → `CERTIFIED ✅`  
> Use `certificatePresent` to show/hide the "Download Certificate" button.

### Update a door *(admin only)*

```
PATCH /v1/doors/:id
```

```json
{ "code": "D-102", "locationNotes": "Updated notes" }
```

### Submit a door *(photographer action — shown for completeness)*

```
POST /v1/doors/:id/submit
```

Sets status from `DRAFT` → `SUBMITTED`. Requires at least one image. This is a **photographer** action — the admin panel does not need to call this endpoint, but the admin can display the current `status` to show whether the photographer has submitted the door. Until the photographer submits, the admin's "Upload Certificate" button should be disabled or hidden.

Once submitted, door photos are locked. If review finds issues, the admin must call `POST /v1/doors/:id/reopen` to move the door back to `DRAFT` before the photographer can change photos again.

---

## 12. Module: Door Images

### List images on a door

```
GET /v1/doors/:id/images
```

**Response** — each image includes pre-generated signed download URLs:

```json
{
  "data": [
    {
      "id": "img123",
      "doorId": "door456",
      "role": "FRONT_FACE",
      "label": "Front face of door",
      "uploadedById": "user789",
      "uploadedAt": "2026-03-09T10:00:00.000Z",
      "downloadUrl": "https://storage.googleapis.com/...",
      "downloadUrlExpiresAt": "2026-03-09T10:15:00.000Z",
      "downloadUrlThumb": "https://storage.googleapis.com/...",
      "downloadUrlThumbExpiresAt": "2026-03-09T10:15:00.000Z"
    }
  ]
}
```

> Signed URLs expire after **15 minutes** (configurable). See [Section 18](#18-signed-url-refresh-strategy) for how to handle expiry on the client.

### Get a fresh signed download URL for a single image

```
GET /v1/doors/:id/images/:imageId/signed-download
```

**Response**

```json
{
  "data": {
    "downloadUrl": "https://storage.googleapis.com/...",
    "downloadUrlExpiresAt": "2026-03-09T10:15:00.000Z",
    "downloadUrlThumb": "https://storage.googleapis.com/...",
    "downloadUrlThumbExpiresAt": "2026-03-09T10:15:00.000Z"
  }
}
```

### Bulk delete images *(admin or uploader)*

Permanently removes images from GCS storage and the database. Each deletion is recorded in the audit log.

```
DELETE /v1/doors/:id/images/bulk
```

```json
{
  "imageIds": ["img1", "img2", "img3"]
}
```

- Minimum 1, maximum 20 IDs per request.
- Admin can delete any image on the door.
- Photographers can only delete images they uploaded.
- Photo deletion is allowed only while the door is `DRAFT`.
- If the door is `SUBMITTED` or `CERTIFIED`, the admin must reopen it before photos can be deleted.

**Response**

```json
{
  "data": {
    "deleted": 3,
    "imageIds": ["img1", "img2", "img3"]
  }
}
```

### Upload images (signed URL flow)

The admin portal does not send images directly to the backend. Instead it uses a **3-step signed URL flow** (see [Section 17](#17-signed-url-pattern--how-it-works)).

> Photo upload and image registration are allowed only while the door status is `DRAFT`. After submit, the door is locked until an admin reopens it.

**Step 1 — Request signed upload URL (single)**

```
POST /v1/doors/:id/images/signed-upload
```

```json
{
  "role": "FRONT_FACE",
  "contentType": "image/jpeg"
}
```

**Response**

```json
{
  "data": {
    "signedUrl": "https://storage.googleapis.com/...",
    "objectPath": "orgs/.../images/original/front_face/uuid.jpg",
    "imageId": "uuid",
    "role": "FRONT_FACE"
  }
}
```

**Step 2 — PUT the image binary directly to GCS**

```
PUT <signedUrl>
Content-Type: image/jpeg

<binary file data>
```

Do not add any extra headers. The signed URL is pre-signed for exactly `image/jpeg`.

**Step 3 — Register the uploaded image**

```
POST /v1/doors/:id/images/register
```

```json
{
  "imageId": "<imageId from step 1>",
  "objectPath": "<objectPath from step 1>",
  "role": "FRONT_FACE",
  "label": "Optional label"
}
```

**Batch upload (up to 10 images at once)**

Request all signed URLs in one call:

```
POST /v1/doors/:id/images/signed-upload/batch
```

```json
{
  "images": [
    { "role": "FRONT_FACE", "contentType": "image/jpeg" },
    { "role": "REAR_FACE",  "contentType": "image/jpeg" }
  ]
}
```

Then upload all files in parallel to their respective signed URLs.

Register all in one call:

```
POST /v1/doors/:id/images/register/batch
```

```json
{
  "images": [
    { "imageId": "uuid1", "objectPath": "orgs/.../uuid1.jpg", "role": "FRONT_FACE" },
    { "imageId": "uuid2", "objectPath": "orgs/.../uuid2.jpg", "role": "REAR_FACE" }
  ]
}
```

---

## 13. Module: Certificates (Door & Building)

Certificates are PDFs uploaded by the admin. Both door and building certificates require a photographer action first:

| Entity | Photographer action | Status gate for certificate upload |
|---|---|---|
| Door | `POST /v1/doors/:id/submit` | `SUBMITTED` or `CERTIFIED` |
| Building | `POST /v1/buildings/:id/approve` | `APPROVED` or `CERTIFIED` |

Uploading a certificate automatically sets the entity status to `CERTIFIED` and sends push notifications to assigned photographers.

### Door certificate *(admin only)*

**Step 1 — Request signed upload URL**

```
POST /v1/doors/:id/certificate/signed-upload
```

No body needed. Returns:

```json
{
  "data": {
    "signedUrl": "https://storage.googleapis.com/...",
    "objectPath": "orgs/.../certificates/door/certId.pdf",
    "certId": "certId"
  }
}
```

**Step 2 — PUT the PDF binary to the signedUrl**

```
PUT <signedUrl>
Content-Type: application/pdf
```

**Step 3 — Register the certificate**

```
POST /v1/doors/:id/certificate/register
```

```json
{
  "certId": "<certId from step 1>",
  "objectPath": "<objectPath from step 1>"
}
```

This sets the door status to `CERTIFIED` and notifies assigned photographers.

### Reopen a submitted door for photo changes *(admin only)*

```
POST /v1/doors/:id/reopen
```

Moves a door from `SUBMITTED` back to `DRAFT` so the photographer can edit photos again.

- Use this when admin review finds issues after submission.
- This does **not** work on `CERTIFIED` doors.
- For certified doors, first delete the certificate to return the door to `SUBMITTED`, then call this endpoint to return it to `DRAFT`.

### Delete door certificate *(admin only)*

```
DELETE /v1/doors/:id/certificate
```

Returns `204 No Content`.

- Removes the door certificate PDF from GCS
- Deletes the certificate record
- Resets the door from `CERTIFIED` back to `SUBMITTED`
- If photo changes are needed after that, call `POST /v1/doors/:id/reopen`

**Download the door certificate**

```
GET /v1/doors/:id/certificate/signed-download
```

Returns `{ signedUrl, expiresAt }`. Open or stream this URL to display/download the PDF.

---

### Building certificate *(admin only)*

> **Pre-requisite**: The building must be approved by a photographer (`status === 'APPROVED'` or `'CERTIFIED'`) before the admin can upload a certificate. The API will return `400 Bad Request` if you try to upload or register while the building is still `DRAFT`.

Same 3-step pattern as door certificates.

**Step 1 — Request upload URL**

```
POST /v1/buildings/:id/certificate/signed-upload
```

No body needed. Returns `{ signedUrl, objectPath, certId }`.

**Step 2 — PUT the PDF binary to the signedUrl**

```
PUT <signedUrl>
Content-Type: application/pdf
```

**Step 3 — Register**

```
POST /v1/buildings/:id/certificate/register
```

```json
{
  "certId": "<certId from step 1>",
  "objectPath": "<objectPath from step 1>"
}
```

This sets the building status to `CERTIFIED` and notifies assigned photographers.

**Download**

```
GET /v1/buildings/:id/certificate/signed-download
```

Returns `{ signedUrl, expiresAt }`. Open or stream this URL to display/download the PDF.

**Delete certificate (and reset to APPROVED)**

```
DELETE /v1/buildings/:id/certificate
```

Returns `204 No Content`. Removes the PDF from GCS and resets the building status back to `APPROVED`, allowing a new certificate to be uploaded.

---

## 14. Legacy Inspections Module Removed

The old `inspections` module has been removed from the active backend API surface.

Do not build new admin or mobile flows against:

- `GET /v1/inspections`
- `POST /v1/inspections`
- `GET /v1/inspections/:id`
- `PATCH /v1/inspections/:id/archive`
- `POST /v1/inspections/:id/assignments`
- `PATCH /v1/inspections/:id/assignments/respond`

Use the current flow instead:

- `building-assignments/*` for invitation and acceptance
- `buildings/:buildingId/surveys/*` for survey lifecycle and fieldwork state
- Do not use `buildings/:buildingId/workflow/*`; those wrapper endpoints are no longer part of the active backend surface.

---

## 15. Module: Exports (Bulk ZIP)

Exports are async jobs. The server queues a ZIP generation job and you poll for completion.

### Queue an export job *(admin only)*

```
POST /v1/exports
```

```json
{
  "targetType": "BUILDING",
  "targetId": "<buildingId>"
}
```

Valid `targetType` values: `DOOR`, `FLOOR`, `BUILDING`, `SITE`

**Response**

```json
{
  "data": {
    "id": "jobId",
    "status": "QUEUED",
    "targetType": "BUILDING",
    "targetId": "...",
    "createdAt": "..."
  }
}
```

### Poll job status

```
GET /v1/exports/:id
```

```json
{
  "data": {
    "id": "jobId",
    "status": "DONE",
    "objectPathZip": "exports/.../jobId.zip",
    "createdAt": "...",
    "error": null
  }
}
```

Poll every 2–3 seconds until `status` is `DONE` or `FAILED`.

### Download the ZIP *(admin only)*

```
GET /v1/exports/:id/signed-download
```

Returns a signed download URL. Open it in a new tab or trigger `window.location.href = url` to start the download.

**ZIP folder structure**

```
Building_BlockA/
  Floor_G/
    Door_D-101/
      front_face/  image1.jpg
      rear_face/   image2.jpg
      certificates/
        door_certificate.pdf
  certificates/
    building_certificate.pdf
```

---

## 16. Module: Survey Versioning

Each building has numbered survey cycles (v1, v2, v3 …). A survey represents one complete inspection cycle: photographer uploads photos → admin uploads door certificates → admin uploads building certificate → admin confirms completion. Once confirmed, the survey is **frozen and read-only**. A new survey can be started at any time by cloning the building's floor/door structure (without images or certificates).

### Survey lifecycle

```
Building created          →  Survey v1 ACTIVE (auto-created on first floor add)
Photographer photos + submit →  Doors: DRAFT → SUBMITTED
Admin review reopen       →  Doors: SUBMITTED → DRAFT
Admin door certs          →  Doors: SUBMITTED → CERTIFIED
Admin delete cert         →  Doors: CERTIFIED → SUBMITTED
Admin building cert       →  Building: APPROVED → CERTIFIED
Admin confirm-complete    →  Survey v1: ACTIVE → COMPLETED  (frozen, read-only)
Admin start-next          →  Survey v2: ACTIVE  (floors/doors cloned, no images)
```

---

### 15.1 List survey history for a building

```
GET /v1/buildings/:id/surveys
```

Returns all surveys for a building in version order (oldest first). Use this to display the **history tab** in the building detail view.

**Response**

```json
{
  "data": [
    {
      "id": "survey_v1_id",
      "version": 1,
      "status": "COMPLETED",
      "startedAt": "2026-01-10T09:00:00Z",
      "completedAt": "2026-01-20T14:30:00Z",
      "createdAt": "2026-01-10T09:00:00Z",
      "createdBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
      "confirmedBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
      "buildingCertificatePresent": true,
      "buildingCertificateUploadedAt": "2026-01-19T11:00:00Z",
      "floorCount": 3,
      "nextScheduledAt": "2026-04-01T09:00:00Z",
      "nextScheduledNote": "Q2 annual inspection",
      "nextAssignedInspector": { "id": "...", "firstName": "John", "lastName": "Doe" }
    },
    {
      "id": "survey_v2_id",
      "version": 2,
      "status": "ACTIVE",
      "startedAt": "2026-04-01T09:00:00Z",
      "completedAt": null,
      ...
    }
  ]
}
```

---

### 15.2 Get the current active survey

```
GET /v1/buildings/:id/surveys/current
```

Returns a summary of the currently `ACTIVE` survey. Use this to show the **current survey status badge** on the building card/detail header.

**Response**

```json
{
  "data": {
    "id": "survey_v2_id",
    "version": 2,
    "status": "ACTIVE",
    "startedAt": "2026-04-01T09:00:00Z",
    "createdAt": "2026-04-01T09:00:00Z",
    "createdBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
    "buildingCertificatePresent": false,
    "buildingCertificateUploadedAt": null,
    "floorCount": 3
  }
}
```

Returns `404` if there is no active survey (all surveys are completed and no new one has been started yet).

---

### 15.3 Get a specific survey (history detail)

```
GET /v1/buildings/:id/surveys/:surveyId
```

Returns full read-only detail of any survey (active or completed), including all floors and doors with their statuses and counts. Use this for the **history detail view**.

**Response**

```json
{
  "data": {
    "id": "survey_v1_id",
    "version": 1,
    "status": "COMPLETED",
    "startedAt": "2026-01-10T09:00:00Z",
    "completedAt": "2026-01-20T14:30:00Z",
    "createdAt": "2026-01-10T09:00:00Z",
    "createdBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
    "confirmedBy": { "id": "...", "firstName": "Admin", "lastName": "User" },
    "buildingCertificatePresent": true,
    "buildingCertificateUploadedAt": "2026-01-19T11:00:00Z",
    "nextScheduledAt": null,
    "nextScheduledNote": null,
    "nextAssignedInspector": null,
    "floors": [
      {
        "id": "floor_1_id",
        "label": "Ground Floor",
        "notes": null,
        "createdAt": "...",
        "doors": [
          {
            "id": "door_1_id",
            "code": "D01",
            "locationNotes": "Main entrance",
            "status": "CERTIFIED",
            "submittedAt": "2026-01-15T10:00:00Z",
            "certifiedAt": "2026-01-18T14:00:00Z",
            "imageCount": 5,
            "certificatePresent": true,
            "createdAt": "..."
          }
        ]
      }
    ]
  }
}
```

> **Note for frontend**: Since completed surveys are frozen, do not show Edit/Delete buttons when `survey.status === "COMPLETED"`. The backend will also reject any mutation attempts with `403 Forbidden`.

---

### 15.4 Get building certificate download URL for a historical survey

```
GET /v1/buildings/:id/surveys/:surveyId/certificate/signed-download
```

Returns a signed download URL for the building certificate of a **specific survey**. Use this in the history detail view when the user wants to view/download the certificate from a past survey.

**Response**

```json
{
  "data": {
    "signedUrl": "https://storage.googleapis.com/...",
    "expiresAt": "2026-03-11T10:30:00Z"
  }
}
```

---

### 15.5 Confirm survey complete *(admin only)*

```
POST /v1/buildings/:id/surveys/confirm-complete
```

Marks the current `ACTIVE` survey as `COMPLETED`. This is the **"Confirm Survey Complete"** button shown after the building certificate has been uploaded.

**Pre-conditions (validated server-side):**
- Building status must be `CERTIFIED` (building certificate has been registered)
- All doors in the current survey must have status `CERTIFIED`
- There must be an active survey for the building

**Request body** (all fields optional — for scheduling the next survey)

```json
{
  "nextScheduledAt": "2026-06-01T09:00:00Z",
  "nextScheduledNote": "Q2 annual inspection",
  "nextAssignedInspectorId": "user_abc123"
}
```

**Response `200 OK`**

```json
{
  "data": {
    "id": "survey_v1_id",
    "version": 1,
    "status": "COMPLETED",
    "completedAt": "2026-01-20T14:30:00Z",
    "confirmedById": "admin_user_id",
    "nextScheduledAt": "2026-06-01T09:00:00Z",
    "nextScheduledNote": "Q2 annual inspection",
    "nextAssignedInspectorId": "user_abc123"
  }
}
```

**Push notifications sent on success:**
- All assigned photographers receive: *"Survey v1 for Building Name has been confirmed complete."*
- If `nextAssignedInspectorId` + `nextScheduledAt` provided: that photographer receives: *"You have been scheduled for the next survey of Building Name on 2026-06-01."*

**Error responses:**

| Status | Message |
|---|---|
| `400` | `"The building certificate must be uploaded before a survey can be confirmed complete"` |
| `400` | `"All doors must be CERTIFIED before confirming survey completion. Doors not yet certified: D01, D03"` |
| `400` | `"A building certificate must be uploaded and registered before confirming completion"` |
| `404` | `"No active survey found for this building"` |

> **UI recommendation**: Show this button only when `Building.status === "CERTIFIED"`. After calling this endpoint successfully, show a toast — *"Survey v{N} confirmed complete!"* — and refresh the survey list.

---

### 15.6 Start the next survey *(admin only)*

```
POST /v1/buildings/:id/surveys/start-next
```

Starts a new survey cycle by cloning the floor/door structure from the last completed survey. No images or certificates are copied — inspectors must re-photograph everything.

**Pre-conditions:**
- No `ACTIVE` survey exists for the building (previous survey must be completed first)

**Request body** (optional)

```json
{
  "assignedInspectorId": "user_abc123"
}
```

**Response `201 Created`**

```json
{
  "data": {
    "id": "survey_v2_id",
    "version": 2,
    "status": "ACTIVE",
    "startedAt": "2026-04-01T09:00:00Z",
    "clonedFromVersion": 1,
    "floorsCloned": 3,
    "doorsCloned": 12
  }
}
```

**What this does server-side:**
- Creates `Survey { version: last+1, status: ACTIVE }`
- Clones all floors from the last completed survey (new IDs, same labels/notes)
- Clones all doors under those floors (new IDs, same codes/locationNotes, `status=DRAFT`, timestamps cleared)
- Does **not** copy: images, door certificates, building certificate
- Resets `Building.status → DRAFT`, clears `approvedAt` / `certifiedAt`

**Error responses:**

| Status | Message |
|---|---|
| `400` | `"A survey (v1) is already active for this building. Complete it before starting a new one."` |
| `400` | `"No completed survey found to clone from. Complete the current survey first."` |

---

### 15.7 Schedule the next survey *(admin only, optional)*

```
PATCH /v1/buildings/:id/surveys/current/schedule
```

Updates scheduling metadata on the current active survey. Can be called at any time — before or after completion. If `nextAssignedInspectorId` is provided, a push notification is sent to that photographer.

**Request body** (all fields optional — send only fields to update)

```json
{
  "nextScheduledAt": "2026-06-01T09:00:00Z",
  "nextScheduledNote": "Focus on upper floors this time",
  "nextAssignedInspectorId": "user_abc123"
}
```

**Response `200 OK`** — returns the updated survey record.

> Pass `null` for any field to clear it: `{ "nextScheduledAt": null, "nextAssignedInspectorId": null }`.

---

### 15.8 Frontend integration guide

#### Building detail page

```
┌────────────────────────────────────────────────────────────┐
│  Block A  ·  v2 ACTIVE                         [Surveys ▼] │
├────────────────────────────────────────────────────────────┤
│  Floors / Doors  |  Survey History                         │
└────────────────────────────────────────────────────────────┘
```

1. On load: call `GET /v1/buildings/:id/surveys/current` to display the current survey badge (`v2 ACTIVE`).
2. The **Floors** tab should show floors from the current active survey only (returned by `GET /v1/buildings/:id/floors`).
3. The **Survey History** tab: call `GET /v1/buildings/:id/surveys` to list all versions. Clicking a completed version opens its read-only detail via `GET /v1/buildings/:id/surveys/:surveyId`.

#### Confirm-complete button visibility

Show the **"Confirm Survey Complete"** button when all of the following are true:
- `building.status === "CERTIFIED"` (building cert uploaded)
- Current survey `status === "ACTIVE"`
- All doors in the current survey have `status === "CERTIFIED"` (check from the floors/doors list)

#### Start-next button visibility

Show the **"Start Next Survey"** button when:
- No active survey exists (all surveys are `COMPLETED`) — `GET /v1/buildings/:id/surveys/current` returns `404`

#### History view — read-only enforcement

When rendering a completed survey's detail:
- Hide all Edit / Delete / Upload buttons
- Show a locked banner: *"This survey (v1) is completed and read-only."*
- Certificate download is still available via `GET /v1/buildings/:id/surveys/:surveyId/certificate/signed-download`

---

## 17. Signed URL Pattern — How it Works

All file access (images, certificates, exports) uses **GCS signed URLs**. Files are never served through the backend — they are accessed directly from Google Cloud Storage.

```
Admin Panel                    Backend API                     GCS
    │                               │                           │
    │  POST /signed-upload          │                           │
    │ ─────────────────────────────►│                           │
    │                               │  Generate signed PUT URL  │
    │                               │ ─────────────────────────►│
    │  { signedUrl, objectPath }    │                           │
    │ ◄─────────────────────────────│                           │
    │                               │                           │
    │  PUT <signedUrl> (file binary)│                           │
    │ ──────────────────────────────────────────────────────────►
    │                               │                           │
    │  POST /register { objectPath }│                           │
    │ ─────────────────────────────►│                           │
    │  { id, role, ... }            │                           │
    │ ◄─────────────────────────────│                           │
```

**Key rules:**
- The `Content-Type` header on the PUT must match what was requested in step 1 (`image/jpeg`, `image/png`, `application/pdf`).
- Do not add `Authorization` or any other custom headers to the GCS PUT — it will fail.
- Signed URLs are single-use and expire after **15 minutes** (uploads) or as stated in `expiresAt` (downloads).

---

## 18. Signed URL Refresh Strategy

Download URLs returned by the API include an `expiresAt` ISO timestamp. Use this to decide when to refresh without making unnecessary API calls.

### Recommended approach

```typescript
// Utility: returns true if the URL needs refreshing (expire within 60s buffer)
function isExpiredOrExpiringSoon(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() < 60_000;
}

// Before rendering an image
async function getValidUrl(image: DoorImage): Promise<string> {
  if (!isExpiredOrExpiringSoon(image.downloadUrlThumbExpiresAt)) {
    return image.downloadUrlThumb;
  }
  // Re-fetch a fresh signed URL
  const res = await api.get(`/v1/doors/${image.doorId}/images/${image.id}/signed-download`);
  return res.data.downloadUrlThumb;
}
```

### For image lists

When rendering a list of door images, check `downloadUrlThumbExpiresAt` for each item. If any are expired or expiring within 60 seconds, re-fetch `GET /v1/doors/:id/images` for the full list (which always returns fresh URLs). This is non-blocking — render thumbnails from cache first, then swap in fresh URLs.

### For single image viewer / lightbox

Use the `GET /v1/doors/:id/images/:imageId/signed-download` endpoint to get a fresh full-resolution URL on demand. Call it immediately before displaying the image, not at list-load time.

### For certificates

Certificate signed download URLs follow the same pattern. Call the `signed-download` endpoint when the user clicks "Download" or "View" — do not cache certificate URLs between sessions.

---

## 19. Mobile App: Show Client Details

Use existing site/building read endpoints. Mobile app does not need `/v1/clients` endpoints.

### Endpoints to use

```
GET /v1/sites
GET /v1/sites/:id
GET /v1/buildings
GET /v1/buildings/:id
```

### Data shape to expect

```json
{
  "id": "building_123",
  "name": "Block A",
  "siteId": null,
  "clientId": "client_123",
  "client": {
    "id": "client_123",
    "name": "Acme Fire Safety Ltd"
  }
}
```

### Rendering rules

- If `client` exists: show `client.name` in the header/details card.
- If `client` is `null`: hide the client row (or show `Not assigned`).
- For buildings linked to a site (`siteId` present), prefer showing the site-level client (from site payload) when building has no direct client.
- Do not assume contact fields are present on mobile payloads from site/building endpoints; show name only unless a dedicated client detail endpoint is added to mobile scope.

### Suggested UI labels

- `Client: Acme Fire Safety Ltd`
- `Client: Not assigned`

---

## 20. Admin-only vs Shared Endpoints

| Endpoint | Admin | Photographer |
|---|---|---|
| `GET/POST/PATCH/DELETE /v1/clients*` | ✅ | ❌ |
| `POST /v1/users` | ✅ | ❌ |
| `PATCH /v1/orgs/me` | ✅ | ❌ |
| `DELETE /v1/sites/:id` | ✅ | ❌ |
| `PATCH /v1/buildings/:id` | ✅ | ❌ |
| `PATCH /v1/floors/:id` | ✅ | ❌ |
| `DELETE /v1/floors/:id` | ✅ | ❌ |
| `PATCH /v1/doors/:id` | ✅ | ❌ |
| `POST /v1/doors/:id/certificate/*` | ✅ | ❌ |
| `POST /v1/buildings/:id/certificate/*` | ✅ | ❌ |
| `POST /v1/exports` | ✅ | ❌ |
| `POST /v1/buildings/:id/surveys/confirm-complete` | ✅ | ❌ |
| `POST /v1/buildings/:id/surveys/start-next` | ✅ | ❌ |
| `PATCH /v1/buildings/:id/surveys/current/schedule` | ✅ | ❌ |
| `GET /v1/exports/:id/signed-download` | ✅ | ❌ |
| `DELETE /v1/doors/:id/images/bulk` | ✅ | own images only |
| `GET /v1/buildings`, `GET /v1/sites` | ✅ all | assigned only |
| `POST /v1/doors/:id/submit` | — | ✅ |

---

## 21. Postman Collection

A ready-to-import Postman collection and environment are available at runtime:

| File | URL |
|---|---|
| Collection | `GET /dev/postman/collection` |
| Environment | `GET /dev/postman/environment` |

Import these directly into Postman using **File → Import → Link**:

```
https://pocket-inspector-api-34292529156.europe-west2.run.app/dev/postman/collection
https://pocket-inspector-api-34292529156.europe-west2.run.app/dev/postman/environment
```

Or locally:

```
http://localhost:3001/dev/postman/collection
http://localhost:3001/dev/postman/environment
```

The collection includes all endpoints with pre-request scripts that automatically handle login, token injection, and variable chaining (e.g., `doorId` is saved from Create Door and reused in image/certificate endpoints).

See [`postman/README.md`](../postman/README.md) for full Newman CI usage.

---

## Summary: What the Admin Panel Needs to Build

| Feature | Endpoints to integrate |
|---|---|
| Login / logout / session management | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/*` |
| User management | `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id` |
| Organisation settings | `GET /orgs/me`, `PATCH /orgs/me` |
| Client management | `GET /clients`, `POST /clients`, `GET /clients/:id`, `PATCH /clients/:id`, `DELETE /clients/:id` |
| Site management (with client mapping) | `GET /sites`, `POST /sites`, `GET /sites/:id`, `PATCH /sites/:id`, `DELETE /sites/:id` |
| Building management (standalone client mapping) | `GET /buildings`, `POST /buildings`, `GET /buildings/:id`, `PATCH /buildings/:id`, `GET /buildings/:id/floors` |
| Floor management | `POST /floors`, `GET /floors/:id`, `PATCH /floors/:id`, `DELETE /floors/:id`, `GET /floors/:id/doors` |
| Door management | `POST /doors`, `GET /doors/:id`, `PATCH /doors/:id` |
| Image viewer | `GET /doors/:id/images`, `GET /doors/:id/images/:imageId/signed-download` |
| Image deletion | `DELETE /doors/:id/images/bulk` |
| Door certificate upload | `POST /doors/:id/certificate/signed-upload` → PUT to GCS → `POST /doors/:id/certificate/register` |
| Door certificate download | `GET /doors/:id/certificate/signed-download` |
| Building certificate upload | `POST /buildings/:id/certificate/signed-upload` → PUT → `POST /buildings/:id/certificate/register` |
| Building certificate download | `GET /buildings/:id/certificate/signed-download` |
| Bulk export / ZIP download | `POST /exports`, `GET /exports/:id` (poll), `GET /exports/:id/signed-download` |
| Survey history list | `GET /buildings/:id/surveys` |
| Current survey status | `GET /buildings/:id/surveys/current` |
| Historical survey detail (read-only) | `GET /buildings/:id/surveys/:surveyId` |
| Historical building cert download | `GET /buildings/:id/surveys/:surveyId/certificate/signed-download` |
| Confirm survey complete | `POST /buildings/:id/surveys/confirm-complete` |
| Start next survey | `POST /buildings/:id/surveys/start-next` |
| Schedule next survey (optional) | `PATCH /buildings/:id/surveys/current/schedule` |
