# Admin / Inspector Endpoint Audit

## Role Model

- The backend only defines two roles in code: `ADMIN` and `INSPECTOR`.
- There is no `SUPER_ADMIN` enum or guard anywhere in the API.
- In the current docs and Postman collection, "super admin" means the backend `ADMIN` role.

## Exact Duplicate Route Check

- No exact duplicate `METHOD + PATH` routes are registered in the Nest controllers.
- The confusion comes from overlapping business flows, not from two controllers owning the same exact endpoint.

## Requested Flow

### 0. Create a fresh inspector account

- `POST /v1/users`
- Role: `ADMIN`
- Purpose: create a new `INSPECTOR` user for a clean test run

### 1. Login as admin and inspector separately

- `POST /v1/auth/login`
- Role: shared
- Purpose: create separate device sessions and tokens for parallel testing

- `GET /v1/auth/me`
- Role: shared
- Purpose: confirm which token belongs to which role

### 2. Admin creates building, assigns inspector, inspector accepts

- `POST /v1/sites`
- Role: `ADMIN`
- Purpose: optional but recommended when the building belongs to a site

- `POST /v1/buildings`
- Role: `ADMIN`
- Purpose: create the building

- `POST /v1/building-assignments`
- Role: `ADMIN`
- Purpose: assign one building to one inspector

- `GET /v1/me/building-assignments`
- Role: `INSPECTOR`
- Purpose: inspector sees pending invitation before accepting

- `POST /v1/building-assignments/:assignmentId/respond`
- Role: `INSPECTOR`
- Purpose: accept or reject the invitation

- `GET /v1/buildings`
- Role: shared, but inspector only sees accepted assignments

- `GET /v1/sites`
- Role: shared, but inspector only sees sites containing accepted assignments

- `GET /v1/buildings/:id`
- Role: shared, but inspector only after accepted assignment

- `GET /v1/building-assignments/history`
- Role: `ADMIN`
- Purpose: audit the assignment lifecycle from the admin side

- `GET /v1/me/building-assignments/history`
- Role: `INSPECTOR`
- Purpose: audit the assignment lifecycle from the inspector side

## Admin-Owned Endpoints

### Core admin management

- `GET /v1/users`
- `POST /v1/users`
- `GET /v1/clients`
- `GET /v1/clients/:id`
- `POST /v1/clients`
- `PATCH /v1/clients/:id`
- `DELETE /v1/clients/:id`
- `PATCH /v1/orgs/me`

### Site and building setup

- `POST /v1/sites`
- `PATCH /v1/sites/:id`
- `DELETE /v1/sites/:id`
- `POST /v1/buildings`
- `PATCH /v1/buildings/:id`

### Assignment workflow

- `POST /v1/building-assignments`
- `POST /v1/building-assignments/bulk`
- `POST /v1/building-assignments/sites/:siteId`
- `POST /v1/building-assignments/buildings/:buildingId/reassign`
- `GET /v1/building-assignments/history`

### Certificate and survey lifecycle

- `POST /v1/doors/:id/certificate/signed-upload`
- `POST /v1/doors/:id/certificate/register`
- `DELETE /v1/doors/:id/certificate`
- `POST /v1/buildings/:id/certificate/signed-upload`
- `POST /v1/buildings/:id/certificate/register`
- `DELETE /v1/buildings/:id/certificate`
- `POST /v1/buildings/:buildingId/surveys/:surveyId/reopen-fieldwork`
- `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`
- `POST /v1/buildings/:buildingId/surveys/confirm-complete`
- `POST /v1/buildings/:buildingId/surveys/start-next`
- `PATCH /v1/buildings/:buildingId/surveys/current/schedule`

### Exports

- `POST /v1/exports`
- `GET /v1/exports/:id`
- `GET /v1/exports/:id/signed-download`

## Inspector-Owned Endpoints

### Assignment acceptance

- `GET /v1/me/building-assignments`
- `GET /v1/me/building-assignments/history`
- `POST /v1/building-assignments/:assignmentId/respond`
- `POST /v1/building-assignments/groups/:groupId/respond`

### Workflow completion

- `POST /v1/buildings/:id/approve`
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`

## Shared Endpoints With Access Scoping

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`
- `POST /v1/auth/logout`
- `GET /v1/auth/sessions`
- `DELETE /v1/auth/sessions`
- `DELETE /v1/auth/sessions/:id`
- `POST /v1/me/device-token`
- `GET /v1/orgs/me`
- `GET /v1/sites`
- `GET /v1/sites/:id`
- `GET /v1/buildings`
- `GET /v1/buildings/:id`
- `GET /v1/buildings/:id/floors`
- `GET /v1/buildings/:id/certificate/signed-download`
- `GET /v1/buildings/:id/surveys/:surveyId/certificate/signed-download`
- `GET /v1/buildings/:buildingId/surveys`
- `GET /v1/buildings/:buildingId/surveys/current`
- `GET /v1/buildings/:buildingId/surveys/:surveyId`
- `POST /v1/floors`
- `GET /v1/floors/:id`
- `GET /v1/floors/:id/doors`
- `POST /v1/doors`
- `GET /v1/doors/:id`
- `GET /v1/doors/:id/images`
- `GET /v1/doors/:id/images/:imageId/signed-download`
- `POST /v1/doors/:id/images/signed-upload`
- `POST /v1/doors/:id/images/register`
- `POST /v1/doors/:id/images/signed-upload/batch`
- `POST /v1/doors/:id/images/register/batch`
- `DELETE /v1/doors/:id/images/bulk`
- `GET /v1/doors/:id/certificate/signed-download`
- `GET /v1/users/:id`
- `PATCH /v1/users/:id`

## Overlaps That Cause Confusion

### 1. Removed inspection module

- The legacy `v1/inspections/*` runtime endpoints have now been removed from the backend surface.
- Historical database tables may still exist, but they are no longer part of the supported API flow.

### 2. Removed workflow wrapper endpoints

- The legacy `POST /v1/buildings/:buildingId/workflow/complete` and `POST /v1/buildings/:buildingId/workflow/reopen` wrapper endpoints have been removed.
- The survey-version endpoints are now the only supported workflow lifecycle surface.

### 3. Same endpoint reused by different Postman requests

- The Postman collection intentionally reuses the same endpoint with different payloads:
- `POST /v1/building-assignments/:assignmentId/respond` for accept and reject
- `POST /v1/buildings/:buildingId/surveys/confirm-complete` for schedule and skip-schedule
- These are not backend duplicates.

## Cleanup Status

### 1. Fixed: cross-org user lookup leak for admins

- `UsersController.findOne()` allows any admin through, but `UsersService.findById()` does not scope by `orgId`.
- This is now fixed with org-scoped lookup.

### 2. Fixed: door submit role drift

- `POST /v1/doors/:id/submit` has no role guard.
- This is now fixed. Admin callers are blocked.

## Recommendation

- Keep the survey-version endpoints as the primary source of truth.
- Do not reintroduce workflow wrapper endpoints.
- The legacy `inspections` module has been removed from the active backend surface.
