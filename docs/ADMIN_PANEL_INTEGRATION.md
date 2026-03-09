# Pocket Inspector — Admin Panel Integration Guide

> **Audience**: Front-end engineers building the Admin Portal.  
> **Phase**: One (Internal MVP)  
> **Base docs**: See [`PocketInspector_FullRequirement_Phase1_v3.md`](./PocketInspector_FullRequirement_Phase1_v3.md) and [`PocketInspector_Schema_Storage_API_Phase1_v4.md`](./PocketInspector_Schema_Storage_API_Phase1_v4.md) for full product context.

---

## Table of Contents

1. [Environment & Base URL](#1-environment--base-url)
2. [Authentication](#2-authentication)
3. [API Conventions](#3-api-conventions)
4. [Enums Reference](#4-enums-reference)
5. [Module: Organisation](#5-module-organisation)
6. [Module: Users](#6-module-users)
7. [Module: Sites](#7-module-sites)
8. [Module: Buildings](#8-module-buildings)
9. [Module: Floors](#9-module-floors)
10. [Module: Doors](#10-module-doors)
11. [Module: Door Images](#11-module-door-images)
12. [Module: Certificates (Door & Building)](#12-module-certificates-door--building)
13. [Module: Inspections & Assignments](#13-module-inspections--assignments)
14. [Module: Exports (Bulk ZIP)](#14-module-exports-bulk-zip)
15. [Signed URL Pattern — How it Works](#15-signed-url-pattern--how-it-works)
16. [Signed URL Refresh Strategy](#16-signed-url-refresh-strategy)
17. [Admin-only vs Shared Endpoints](#17-admin-only-vs-shared-endpoints)
18. [Postman Collection](#18-postman-collection)

---

## 1. Environment & Base URL

| Environment | Base URL |
|---|---|
| Local dev | `http://localhost:3000` |
| Production | `https://pocket-inspector-api-34292529156.europe-west2.run.app` |

All API routes are versioned under `/v1/`:

```
GET  https://pocket-inspector-api-.../v1/buildings
POST https://pocket-inspector-api-.../v1/auth/login
```

**Swagger UI** (local dev only): `http://localhost:3000/api/docs`

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
| `InspectionType` | `SITE`, `BUILDING` |
| `InspectionStatus` | `ACTIVE`, `ARCHIVED` |
| `AssignmentStatus` | `PENDING`, `ACCEPTED`, `DECLINED` |
| `DoorStatus` | `DRAFT`, `SUBMITTED`, `CERTIFIED` |
| `ImageRole` | `FRONT_FACE`, `REAR_FACE`, `FRAME_GAP`, `INTUMESCENT_STRIP`, `SELF_CLOSER`, `HINGES`, `SIGNAGE`, `OTHER` |
| `DevicePlatform` | `IOS`, `ANDROID` |
| `ExportTargetType` | `DOOR`, `FLOOR`, `BUILDING`, `SITE`, `INSPECTION` |
| `ExportStatus` | `QUEUED`, `RUNNING`, `DONE`, `FAILED` |

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
  "email": "inspector@example.com",
  "password": "securepassword123",
  "role": "INSPECTOR",
  "firstName": "Jane",
  "lastName": "Doe"
}
```

> Use this to onboard new admins or inspectors. There is no public signup — all accounts are created internally.

### Get a user by ID

```
GET /v1/users/:id
```

Admin can get any user. An inspector can only get their own profile.

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

Admin can update any user. An inspector can only update themselves.

---

## 7. Module: Sites

Sites are optional top-level containers for buildings (used when inspection type is `SITE`).

### List sites

```
GET /v1/sites
```

Admin sees all sites. Inspector sees only their own or assigned sites.

### Create a site

```
POST /v1/sites
```

```json
{
  "name": "London Portfolio 2025",
  "referenceCode": "SITE-001",
  "locationNotes": "Near Tower Bridge, SE1"
}
```

Only `name` is required.

### Get a site

```
GET /v1/sites/:id
```

### Update a site *(admin only)*

```
PATCH /v1/sites/:id
```

```json
{ "name": "Updated Name" }
```

### Delete a site *(admin only)*

```
DELETE /v1/sites/:id
```

Returns `204 No Content`.

---

## 8. Module: Buildings

### List buildings

```
GET /v1/buildings
GET /v1/buildings?siteId=<siteId>    — filter by site
```

Admin sees all. Inspector sees own + assigned.

### Create a building

```
POST /v1/buildings
```

```json
{
  "name": "Block A",
  "buildingCode": "BLD-001",
  "locationNotes": "Corner of King St",
  "siteId": "<optional-site-id>"
}
```

Only `name` is required.

### Get a building

```
GET /v1/buildings/:id
```

### Update a building *(admin only)*

```
PATCH /v1/buildings/:id
```

```json
{ "name": "Block B", "locationNotes": "Updated notes" }
```

### List floors of a building

```
GET /v1/buildings/:id/floors
```

---

## 9. Module: Floors

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

## 10. Module: Doors

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

### Submit a door *(inspector action — shown for completeness)*

```
POST /v1/doors/:id/submit
```

Sets status from `DRAFT` → `SUBMITTED`. Requires at least one image. This is an inspector action — the admin panel does not need to call this.

---

## 11. Module: Door Images

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

> Signed URLs expire after **15 minutes** (configurable). See [Section 16](#16-signed-url-refresh-strategy) for how to handle expiry on the client.

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
- Inspector can only delete images they uploaded.

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

The admin portal does not send images directly to the backend. Instead it uses a **3-step signed URL flow** (see [Section 15](#15-signed-url-pattern--how-it-works)).

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

## 12. Module: Certificates (Door & Building)

Certificates are PDFs uploaded by the admin. Uploading a door certificate automatically sets the door status to `CERTIFIED` and sends push notifications to assigned inspectors.

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

This sets the door status to `CERTIFIED` and notifies assigned inspectors.

**Download the door certificate**

```
GET /v1/doors/:id/certificate/signed-download
```

Returns `{ signedUrl, expiresAt }`. Open or stream this URL to display/download the PDF.

---

### Building certificate *(admin only)*

Same 3-step pattern as door certificates.

**Step 1 — Request upload URL**

```
POST /v1/buildings/:id/certificate/signed-upload
```

**Step 2 — PUT PDF to signedUrl**

**Step 3 — Register**

```
POST /v1/buildings/:id/certificate/register
```

```json
{
  "certId": "<certId>",
  "objectPath": "<objectPath>"
}
```

**Download**

```
GET /v1/buildings/:id/certificate/signed-download
```

---

## 13. Module: Inspections & Assignments

### List inspections

```
GET /v1/inspections
```

Admin sees all inspections in the org.

### Create an inspection *(admin only)*

```
POST /v1/inspections
```

```json
{
  "type": "BUILDING",
  "buildingId": "<buildingId>"
}
```

For a site inspection:

```json
{
  "type": "SITE",
  "siteId": "<siteId>"
}
```

### Get an inspection (with assignments)

```
GET /v1/inspections/:id
```

Includes the list of inspector assignments and their status (`PENDING`, `ACCEPTED`, `DECLINED`).

### Archive an inspection *(admin only)*

```
PATCH /v1/inspections/:id/archive
```

No body. Sets status to `ARCHIVED`.

### Assign an inspector *(admin only)*

```
POST /v1/inspections/:id/assignments
```

```json
{
  "inspectorId": "<userId>",
  "adminNote": "Please complete by end of month"
}
```

### Respond to an assignment *(inspector action — shown for completeness)*

```
PATCH /v1/inspections/:id/assignments/respond
```

```json
{
  "status": "ACCEPTED",
  "inspectorNote": "Will start on Monday"
}
```

This is called by the mobile app. The admin panel can display the current `status` but does not need to call this endpoint.

---

## 14. Module: Exports (Bulk ZIP)

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

Valid `targetType` values: `DOOR`, `FLOOR`, `BUILDING`, `SITE`, `INSPECTION`

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

## 15. Signed URL Pattern — How it Works

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

## 16. Signed URL Refresh Strategy

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

## 17. Admin-only vs Shared Endpoints

| Endpoint | Admin | Inspector |
|---|---|---|
| `POST /v1/users` | ✅ | ❌ |
| `PATCH /v1/orgs/me` | ✅ | ❌ |
| `DELETE /v1/sites/:id` | ✅ | ❌ |
| `PATCH /v1/buildings/:id` | ✅ | ❌ |
| `PATCH /v1/floors/:id` | ✅ | ❌ |
| `DELETE /v1/floors/:id` | ✅ | ❌ |
| `PATCH /v1/doors/:id` | ✅ | ❌ |
| `POST /v1/doors/:id/certificate/*` | ✅ | ❌ |
| `POST /v1/buildings/:id/certificate/*` | ✅ | ❌ |
| `POST /v1/inspections` | ✅ | ❌ |
| `PATCH /v1/inspections/:id/archive` | ✅ | ❌ |
| `POST /v1/inspections/:id/assignments` | ✅ | ❌ |
| `POST /v1/exports` | ✅ | ❌ |
| `GET /v1/exports/:id/signed-download` | ✅ | ❌ |
| `DELETE /v1/doors/:id/images/bulk` | ✅ | own images only |
| `GET /v1/buildings`, `GET /v1/sites` | ✅ all | assigned only |
| `GET /v1/inspections` | ✅ all | assigned only |
| `POST /v1/doors/:id/submit` | — | ✅ |
| `PATCH /v1/inspections/:id/assignments/respond` | — | ✅ |

---

## 18. Postman Collection

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
http://localhost:3000/dev/postman/collection
http://localhost:3000/dev/postman/environment
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
| Site management | `GET /sites`, `POST /sites`, `GET /sites/:id`, `PATCH /sites/:id`, `DELETE /sites/:id` |
| Building management | `GET /buildings`, `POST /buildings`, `GET /buildings/:id`, `PATCH /buildings/:id`, `GET /buildings/:id/floors` |
| Floor management | `POST /floors`, `GET /floors/:id`, `PATCH /floors/:id`, `DELETE /floors/:id`, `GET /floors/:id/doors` |
| Door management | `POST /doors`, `GET /doors/:id`, `PATCH /doors/:id` |
| Image viewer | `GET /doors/:id/images`, `GET /doors/:id/images/:imageId/signed-download` |
| Image deletion | `DELETE /doors/:id/images/bulk` |
| Door certificate upload | `POST /doors/:id/certificate/signed-upload` → PUT to GCS → `POST /doors/:id/certificate/register` |
| Door certificate download | `GET /doors/:id/certificate/signed-download` |
| Building certificate upload | `POST /buildings/:id/certificate/signed-upload` → PUT → `POST /buildings/:id/certificate/register` |
| Building certificate download | `GET /buildings/:id/certificate/signed-download` |
| Inspection management | `GET /inspections`, `POST /inspections`, `GET /inspections/:id`, `PATCH /inspections/:id/archive` |
| Inspector assignment | `POST /inspections/:id/assignments` |
| Bulk export / ZIP download | `POST /exports`, `GET /exports/:id` (poll), `GET /exports/:id/signed-download` |
