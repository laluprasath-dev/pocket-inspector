# Pocket Inspector — Mobile Client Details Guide

> Audience: Mobile app developers (iOS/Android)  
> Scope: Read/display client details when available on Site/Building payloads

---

## 1) Goal

Show client information in mobile screens without adding new mobile-only endpoints.

Use existing read endpoints:

- `GET /v1/sites`
- `GET /v1/sites/:id`
- `GET /v1/buildings`
- `GET /v1/buildings/:id`

These responses now include optional client fields:

- `clientId: string | null`
- `client: { id: string; name: string } | null`

---

## 2) Rendering Rules

- If `client` exists: render `client.name`.
- If `client` is null: render nothing or `Not assigned`.
- For building detail:
  - If building has direct `client`, show it.
  - If building has no direct client but belongs to a site, show site client when site data is loaded.

Suggested labels:

- `Client: Acme Fire Safety Ltd`
- `Client: Not assigned`

---

## 3) Example Payloads

### Site payload (with client)

```json
{
  "data": {
    "id": "site_123",
    "name": "Main Campus",
    "clientId": "client_123",
    "client": {
      "id": "client_123",
      "name": "Acme Fire Safety Ltd"
    }
  }
}
```

### Building payload (standalone with client)

```json
{
  "data": {
    "id": "building_123",
    "name": "Block A",
    "siteId": null,
    "clientId": "client_123",
    "client": {
      "id": "client_123",
      "name": "Acme Fire Safety Ltd"
    }
  }
}
```

### Building payload (site-linked, no direct client)

```json
{
  "data": {
    "id": "building_456",
    "name": "Site Building",
    "siteId": "site_123",
    "clientId": null,
    "client": null
  }
}
```

In this case, fetch or use cached `site_123` and display site-level client if present.

---

## 4) Null-Safe UI Checklist

- Never assume `client` is present.
- Handle empty/missing `clientId` and `client`.
- Keep UI resilient for old data created before client mapping existed.

---

## 5) Reference Docs

- Admin integration: `docs/ADMIN_PANEL_INTEGRATION.md`
- Postman collection: `postman/Pocket-Inspector.postman_collection.json`
- Swagger (local): `http://localhost:3001/api/docs`
