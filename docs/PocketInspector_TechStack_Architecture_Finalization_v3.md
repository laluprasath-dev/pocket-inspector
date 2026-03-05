# Pocket Inspector — Tech Stack + Architecture (Phase One Finalization) — v3

## 1) Principles
- Cost-effective MVP
- Fast access (thumbnail-first, direct storage access)
- Scalable (stateless API + async exports)
- Maintainable (clear modules + consistent schema)

---

## 2) Stack (Phase One)
### Mobile
- React Native
- TanStack Query (cache metadata)
- Upload queue + retries
- Push notifications (FCM)

### Admin Portal
- Next.js (React)
- TanStack Query
- Pagination + filters
- “Progress badges” (upload counts + certification statuses)

### Backend
- NestJS (TypeScript) using Fastify adapter
- Stateless API
- Background worker for exports

### DB
- PostgreSQL

### Storage
- Private GCS bucket (europe-west2, London)
- Signed URLs for upload/download

### Notifications
- FCM (store device tokens in DB, send on certificate upload)

### Caching (Phase One)
- Client caching required
- Redis optional (do NOT add unless needed)

---

## 3) Architecture overview
Clients:
- Mobile app
- Admin portal

Core:
- API (Nest/Fastify)
- Postgres
- GCS

Async:
- Export worker generates ZIPs and uploads to GCS
- Notification sender (can be inside API initially)

---

## 4) Performance rules (must)
1) Direct upload/download via signed URLs (no proxying files through API)
2) Thumbnails for list/grid views
3) Pagination on doors and images
4) Async ZIP export (jobs table + worker)

---

## 5) Security model
- Admin: full access across org
- Inspector: access by assignment/ownership
- Signed URLs short-lived (5–15 min)
- Bucket private

---

## 6) Future tasks (separate)
- Hosted AI pipeline
- Bulk certificate upload automation (doorCode mapping)
- Redis caching/rate limiting
- CDN for heavy repeated viewing
