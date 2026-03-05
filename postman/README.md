# Pocket Inspector — Postman Collection

## Import

1. Open Postman → **Import**
2. Select both files:
   - `Pocket-Inspector.postman_collection.json`
   - `Pocket-Inspector.postman_environment.json`
3. Select **Pocket Inspector — Local** from the environment dropdown (top-right)

## Quick Start Workflow

Run requests in this order for a complete end-to-end test:

```
🔑 Auth
  └─ Login as Admin             ← saves accessToken + adminId automatically

🏢 Orgs
  └─ Get My Org

👤 Users
  └─ List All Users
  └─ Create User

📍 Sites
  └─ Create Site                ← saves siteId automatically

🏗️ Buildings
  └─ Create Building            ← saves buildingId automatically
  └─ List Floors in Building

🏠 Floors
  └─ Create Floor               ← saves floorId automatically
  └─ List Doors in Floor

🚪 Doors
  └─ Create Door                ← saves doorId automatically
  └─ Request Image Upload URL   ← saves imageUploadUrl + imageObjectPath
      (PUT the file to imageUploadUrl directly from Postman or mobile SDK)
  └─ Register Door Image
  └─ Submit Door

🔑 Auth
  └─ Login as Inspector         ← switches token + saves inspectorId

🔍 Inspections
  └─ Login as Admin             ← switch back to admin
  └─ Create Inspection          ← saves inspectionId
  └─ Assign Inspector
  └─ Login as Inspector         ← switch to inspector
  └─ Respond to Assignment

📦 Exports
  └─ Login as Admin
  └─ Create Export Job          ← saves exportJobId
  └─ Get Export Job Status      ← poll until DONE
  └─ Get Export Download URL
```

## Token Management

All requests under `🔑 Auth > Login as Admin/Inspector` include a **Tests** script that:
- Sets `accessToken` and `refreshToken` in collection variables
- Calls `/v1/auth/me` and saves `adminId` or `inspectorId`

The collection-level **Authorization** is `Bearer {{accessToken}}`, so every request automatically uses the last logged-in user's token.

## Environments

| Environment | `baseUrl` |
|---|---|
| Local | `http://localhost:3000` |
| Staging | `https://api-staging.pocket-inspector.com` |
| Production | `https://api.pocket-inspector.com` |

Duplicate the local environment and change `baseUrl` for other environments.

## Notes

- `passwordHash` is **never** returned in any API response
- All responses follow the `{ "data": ... }` envelope
- All error responses follow `{ "statusCode", "message", "error", "path", "timestamp" }`
- GCS signed-upload URLs expire in **15 minutes** — upload immediately
- Export jobs run asynchronously — poll `GET /v1/exports/:id` until status is `DONE`
