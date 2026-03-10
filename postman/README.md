# Pocket Inspector — API Reference

## Import into Postman

**Option A — by URL** (recommended, always up to date):
1. Start the local server: `npm run start:dev`
2. In Postman → **Import → Link**
3. Import collection: `http://localhost:3001/dev/postman/collection`
4. Import environment: `http://localhost:3001/dev/postman/environment`

**Option B — by file:**
1. Postman → **Import** → select `Pocket-Inspector.postman_collection.json`
2. Import → select `Pocket-Inspector.postman_environment.json`

**After importing:**
- Select **Pocket Inspector — Local** from the environment dropdown (top-right)
- Set `baseUrl` Current Value to `http://localhost:3001`

---

## Environments

| Environment | baseUrl |
|-------------|---------|
| Local | `http://localhost:3001` |
| Production | `https://pocket-inspector-api-34292529156.europe-west2.run.app` |

To switch to production, change `baseUrl` Current Value in the environment editor.

---

## How Tokens Work

- **Login** → you get an `accessToken` (valid 7 days) and a `refreshToken` (valid 90 days)
- **Every request** sends the `accessToken` in the `Authorization: Bearer ...` header automatically
- **Token expired?** Call `POST /v1/auth/refresh` to get a new one without logging in again
- The collection handles this automatically — just login first and everything else works

---

## All Endpoints

### 🔑 Auth — Who you are

| Request | What it does |
|---------|-------------|
| **Login as Admin** | Login with admin credentials → saves token automatically |
| **Login as Inspector** | Login with inspector credentials → switches token automatically |
| **Refresh Token** | Get a new access token using your refresh token |
| **Get Current User (me)** | See your own profile |
| **List Active Sessions** | See all devices currently logged in as you |
| **Revoke Session by ID** | Kick a specific device (logout that device remotely) |
| **Revoke ALL Sessions** | Logout from all devices at once |
| **Logout (current device)** | Logout from this device only |

> **Login sends:** `email`, `password`, `deviceId` (stable UUID per device), `deviceName`, `deviceType`
> Each device gets its own session. Revoke a session = that device gets 401 on next request.

---

### 🏢 Orgs — Your organisation

Every user belongs to one org. Admins can update org details.

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **Get My Org** | Admin + Inspector | See org name and details |
| **Update My Org** | Admin only | Change org name |

---

### 👤 Users — People in your org

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **List All Users** | Admin only | See everyone in the org |
| **Create User** | Admin only | Add a new Admin or Inspector |
| **Get User by ID** | Admin only | See one user's details |
| **Update User** | Admin only | Change name, role etc. |

> Roles: `ADMIN` (manages everything) or `INSPECTOR` (does inspections)

---

### 📍 Sites — Physical locations

A **Site** is a location (e.g. "London Office", "Manchester Warehouse").

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **List Sites** | Admin + Inspector | See all sites |
| **Create Site** | Admin only | Add a new site → saves `siteId` |
| **Get Site by ID** | Admin + Inspector | See one site |
| **Update Site** | Admin only | Change site details |
| **Delete Site** | Admin only | Remove a site |

---

### 🏗️ Buildings — Buildings within a site

A **Building** belongs to a **Site**. A site can have many buildings.

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **List Buildings** | Admin + Inspector | See all buildings (filter by `?siteId=`) |
| **Create Building** | Admin only | Add a building → saves `buildingId` |
| **Get Building by ID** | Admin + Inspector | See one building |
| **Update Building** | Admin only | Change building details |
| **List Floors in Building** | Admin + Inspector | See all floors in a building |
| **Request Building Certificate Upload** | Admin only | Get a signed URL to upload a PDF certificate to cloud storage |
| **Register Building Certificate** | Admin only | Tell the API the certificate has been uploaded |
| **Get Building Certificate Download URL** | Admin + Inspector | Get a signed URL to download the certificate |

> Certificate flow: Request upload URL → upload PDF directly to that URL → Register it → Download anytime

---

### 🏠 Floors — Floors within a building

A **Floor** belongs to a **Building**. A building can have many floors.

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **Create Floor** | Admin only | Add a floor (e.g. "Ground", "Level 1") → saves `floorId` |
| **Get Floor by ID** | Admin + Inspector | See floor details |
| **Update Floor** | Admin only | Change floor label/notes |
| **Delete Floor** | Admin only | Remove a floor |
| **List Doors in Floor** | Admin + Inspector | See all doors on this floor |

---

### 🚪 Doors — Doors on a floor

A **Door** belongs to a **Floor**. Inspectors inspect doors and upload photos.

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **Create Door** | Admin only | Add a door with a code → saves `doorId` |
| **Get Door by ID** | Admin + Inspector | See door details + status |
| **Update Door** | Admin + Inspector | Change door code/notes |
| **Request Image Upload URL** | Inspector | Get a signed URL to upload a door photo |
| **Register Door Image** | Inspector | Tell the API the photo has been uploaded |
| **List Door Images** | Admin + Inspector | See all photos for this door |
| **Submit Door** | Inspector | Mark door inspection as complete (needs ≥1 image) |
| **Request Door Certificate Upload** | Admin only | Get a signed URL to upload a door certificate |
| **Register Door Certificate** | Admin only | Tell the API the certificate has been uploaded |
| **Get Door Certificate Download URL** | Admin + Inspector | Get a signed URL to download the certificate |

> **Door status flow:** `DRAFT` → (inspector submits) → `SUBMITTED` → (admin certifies) → `CERTIFIED`

> **Image upload flow:** Request URL → upload photo directly to that URL → Register it

---

### 🔍 Inspections — Inspection jobs

An **Inspection** is an assignment of work. Admin creates it, assigns an Inspector, Inspector responds.

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **List Inspections** | Admin + Inspector | See all inspections |
| **Create Inspection** | Admin only | Start a new inspection job → saves `inspectionId` |
| **Get Inspection by ID** | Admin + Inspector | See full inspection details |
| **Assign Inspector** | Admin only | Assign an inspector to the job |
| **Respond to Assignment** | Inspector | Accept or decline the assignment |
| **Archive Inspection** | Admin only | Close/archive a completed inspection |

> **Inspection flow:** Create → Assign Inspector → Inspector Accepts → Work done → Archive

---

### 📦 Exports — Download inspection data as ZIP

Create a ZIP export of all data (doors, images, certificates) for a building, site, or inspection.

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **Create Export Job** | Admin only | Start building a ZIP → saves `exportJobId` |
| **Get Export Job Status** | Admin only | Check if ZIP is ready (`QUEUED` → `RUNNING` → `DONE`) |
| **Get Export Download URL** | Admin only | Get a signed URL to download the ZIP (only when `DONE`) |

> Export runs in the background. Poll status every few seconds until `DONE`, then download.

---

### 📱 Notifications — Push notifications

| Request | Who can use | What it does |
|---------|-------------|-------------|
| **Register Device Token (FCM)** | Admin + Inspector | Register a device for push notifications (Firebase) |

> Mobile apps call this after login to enable push notifications for that device.

---

### ❤️ Health — Server status

| Request | What it does |
|---------|-------------|
| **Health Check** | Check if the server and database are running. Returns `{ "status": "ok" }` |

> Use this to verify the server is up before making other requests.

---

## Response Format

Every response is wrapped the same way:

```json
// Success
{ "data": { ... } }

// Error
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "path": "/v1/doors",
  "timestamp": "2026-03-06T12:00:00Z"
}
```

## Role Permissions Summary

| Feature | ADMIN | INSPECTOR |
|---------|-------|-----------|
| Manage users | ✅ | ❌ |
| Manage sites/buildings/floors | ✅ | ❌ |
| Create/manage doors | ✅ | ❌ |
| Upload door images | ✅ | ✅ |
| Submit door inspection | ❌ | ✅ |
| Upload certificates | ✅ | ❌ |
| Create inspections | ✅ | ❌ |
| Respond to assignments | ❌ | ✅ |
| Create exports | ✅ | ❌ |
| View everything | ✅ | ✅ (own org) |
