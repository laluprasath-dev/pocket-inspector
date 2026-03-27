# Current Active Endpoints By Role

Base path: `/v1`

`ADMIN` is the highest role in this backend. There is no separate `SUPER_ADMIN` role.

Product/UI wording uses `Photographer`, while the current API contract still uses the existing role value `INSPECTOR` and fields like `inspectorId`.

Swagger UI and Postman now also expose consumer-specific grouping:
- Swagger tags: `admin-portal`, `mobile-photographer`
- Postman folders: `🖥️ Admin Portal Endpoints`, `📱 Photographer Mobile Endpoints`

## Shared Endpoints

These are available to both `ADMIN` and photographer accounts (API role `INSPECTOR`), but photographer access is scoped to their own user or to buildings they currently have an accepted assignment for.

| Endpoint | Who uses it | Notes |
|---|---|---|
| `POST /auth/login` | Admin, Photographer | Login |
| `POST /auth/refresh` | Admin, Photographer | Refresh token |
| `GET /auth/me` | Admin, Photographer | Current user |
| `POST /auth/logout` | Admin, Photographer | Logout current session |
| `GET /auth/sessions` | Admin, Photographer | List own sessions |
| `DELETE /auth/sessions/:id` | Admin, Photographer | Revoke one own session |
| `DELETE /auth/sessions` | Admin, Photographer | Revoke all own sessions |
| `GET /orgs/me` | Admin, Photographer | Read current org |
| `GET /users/:id` | Admin, Photographer | Photographer can read only self |
| `PATCH /users/:id` | Admin, Photographer | Photographer can update only self |
| `GET /sites` | Admin, Photographer | Photographer sees only accessible sites |
| `GET /sites/:id` | Admin, Photographer | Photographer sees only accessible sites |
| `GET /buildings` | Admin, Photographer | Photographer sees only accessible buildings |
| `GET /buildings/:id` | Admin, Photographer | Photographer sees only accessible buildings |
| `GET /buildings/:id/floors` | Admin, Photographer | Photographer sees only accessible buildings |
| `GET /buildings/:id/certificate/signed-download` | Admin, Photographer | Current active survey certificate |
| `GET /buildings/:id/surveys/:surveyId/certificate/signed-download` | Admin, Photographer | Historical survey certificate |
| `POST /floors` | Admin, Photographer | Photographer only on assigned building |
| `GET /floors/:id` | Admin, Photographer | Photographer only on assigned building |
| `GET /floors/:id/doors` | Admin, Photographer | Photographer only on assigned building |
| `POST /doors` | Admin, Photographer | Photographer only on assigned floor/building |
| `GET /doors/:id` | Admin, Photographer | Photographer only on assigned building |
| `GET /doors/:id/images` | Admin, Photographer | Photographer only on assigned building |
| `GET /doors/:id/images/:imageId/signed-download` | Admin, Photographer | Photographer only on assigned building |
| `POST /doors/:id/images/signed-upload` | Admin, Photographer | Photographer only on assigned building |
| `POST /doors/:id/images/register` | Admin, Photographer | Photographer only on assigned building |
| `POST /doors/:id/images/signed-upload/batch` | Admin, Photographer | Photographer only on assigned building |
| `POST /doors/:id/images/register/batch` | Admin, Photographer | Photographer only on assigned building |
| `DELETE /doors/:id/images/bulk` | Admin, Photographer | Admin can delete any; photographer only own uploads |
| `GET /doors/:id/certificate/signed-download` | Admin, Photographer | Photographer only on assigned building |
| `GET /buildings/:buildingId/surveys` | Admin, Photographer | Survey history for an accessible building |
| `GET /buildings/:buildingId/surveys/current` | Admin, Photographer | Current active survey |
| `GET /buildings/:buildingId/surveys/:surveyId` | Admin, Photographer | Survey detail/history |
| `POST /me/device-token` | Admin, Photographer | Register push token |

## Admin-Only Endpoints

These are the endpoints the admin portal should use for management and lifecycle control.

| Endpoint | Purpose |
|---|---|
| `PATCH /orgs/me` | Update organisation |
| `GET /users` | List users |
| `POST /users` | Create admin or photographer account |
| `GET /clients` | List clients |
| `GET /clients/:id` | Get client detail |
| `POST /clients` | Create client |
| `PATCH /clients/:id` | Update client |
| `DELETE /clients/:id` | Delete client |
| `POST /sites` | Create site |
| `PATCH /sites/:id` | Update site |
| `DELETE /sites/:id` | Delete site |
| `POST /buildings` | Create building |
| `PATCH /buildings/:id` | Update building |
| `POST /buildings/:id/certificate/signed-upload` | Request building certificate upload URL |
| `POST /buildings/:id/certificate/register` | Register building certificate |
| `DELETE /buildings/:id/certificate` | Delete building certificate |
| `PATCH /floors/:id` | Update floor |
| `DELETE /floors/:id` | Delete floor |
| `PATCH /doors/:id` | Update door |
| `POST /doors/:id/certificate/signed-upload` | Request door certificate upload URL |
| `POST /doors/:id/certificate/register` | Register door certificate |
| `DELETE /doors/:id/certificate` | Delete door certificate |
| `POST /building-assignments` | Assign one building to photographer |
| `POST /building-assignments/bulk` | Assign many buildings to photographer |
| `POST /building-assignments/sites/:siteId` | Assign site buildings to photographer |
| `POST /building-assignments/buildings/:buildingId/reassign` | Reassign building |
| `GET /building-assignments/history` | Admin assignment/workflow history |
| `POST /buildings/:buildingId/surveys/:surveyId/reopen-fieldwork` | Reopen photographer-completed fieldwork |
| `POST /buildings/:buildingId/surveys/:surveyId/activate` | Activate planned survey |
| `POST /buildings/:buildingId/surveys/confirm-complete` | Confirm survey complete |
| `POST /buildings/:buildingId/surveys/start-next` | Create next planned survey |
| `PATCH /buildings/:buildingId/surveys/current/schedule` | Set next survey schedule |
| `POST /exports` | Create ZIP export |
| `GET /exports/:id` | Get export status |
| `GET /exports/:id/signed-download` | Get export download URL |

## Photographer-Only Endpoints

These are the endpoints the photographer app should use for invitation handling and fieldwork actions.

| Endpoint | Purpose |
|---|---|
| `GET /me/building-assignments` | List pending and accepted assignments |
| `GET /me/building-assignments/history` | Photographer assignment/workflow history |
| `POST /building-assignments/:assignmentId/respond` | Accept or decline one assignment |
| `POST /building-assignments/groups/:groupId/respond` | Accept or decline grouped site invitation |
| `POST /buildings/:id/approve` | Approve building before certificate stage |
| `POST /doors/:id/submit` | Submit door after images are uploaded |
| `POST /buildings/:buildingId/surveys/:surveyId/complete-fieldwork` | Mark active survey fieldwork complete |

## Recommended Fresh Flow

1. Admin login: `POST /auth/login`
2. Admin creates photographer: `POST /users`
3. Admin creates site: `POST /sites`
4. Admin creates building: `POST /buildings`
5. Admin assigns photographer: `POST /building-assignments`
6. Photographer login: `POST /auth/login`
7. Photographer checks invitation: `GET /me/building-assignments`
8. Photographer accepts invitation: `POST /building-assignments/:assignmentId/respond`
9. Photographer performs fieldwork: `POST /floors`, `POST /doors`, image upload/register endpoints, `POST /doors/:id/submit`
10. Photographer completes survey fieldwork: `POST /buildings/:buildingId/surveys/:surveyId/complete-fieldwork`
11. Admin reviews and finishes lifecycle: certificate endpoints, `POST /buildings/:buildingId/surveys/confirm-complete`, then `POST /buildings/:buildingId/surveys/start-next` when needed
