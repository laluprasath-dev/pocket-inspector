# Current Active Endpoints By Role

Base path: `/v1`

`ADMIN` is the highest role in this backend. There is no separate `SUPER_ADMIN` role.

## Shared Endpoints

These are available to both `ADMIN` and `INSPECTOR`, but inspector access is scoped to their own user or to buildings they currently have an accepted assignment for.

| Endpoint | Who uses it | Notes |
|---|---|---|
| `POST /auth/login` | Admin, Inspector | Login |
| `POST /auth/refresh` | Admin, Inspector | Refresh token |
| `GET /auth/me` | Admin, Inspector | Current user |
| `POST /auth/logout` | Admin, Inspector | Logout current session |
| `GET /auth/sessions` | Admin, Inspector | List own sessions |
| `DELETE /auth/sessions/:id` | Admin, Inspector | Revoke one own session |
| `DELETE /auth/sessions` | Admin, Inspector | Revoke all own sessions |
| `GET /orgs/me` | Admin, Inspector | Read current org |
| `GET /users/:id` | Admin, Inspector | Inspector can read only self |
| `PATCH /users/:id` | Admin, Inspector | Inspector can update only self |
| `GET /sites` | Admin, Inspector | Inspector sees only accessible sites |
| `GET /sites/:id` | Admin, Inspector | Inspector sees only accessible sites |
| `GET /buildings` | Admin, Inspector | Inspector sees only accessible buildings |
| `GET /buildings/:id` | Admin, Inspector | Inspector sees only accessible buildings |
| `GET /buildings/:id/floors` | Admin, Inspector | Inspector sees only accessible buildings |
| `GET /buildings/:id/certificate/signed-download` | Admin, Inspector | Current active survey certificate |
| `GET /buildings/:id/surveys/:surveyId/certificate/signed-download` | Admin, Inspector | Historical survey certificate |
| `POST /floors` | Admin, Inspector | Inspector only on assigned building |
| `GET /floors/:id` | Admin, Inspector | Inspector only on assigned building |
| `GET /floors/:id/doors` | Admin, Inspector | Inspector only on assigned building |
| `POST /doors` | Admin, Inspector | Inspector only on assigned floor/building |
| `GET /doors/:id` | Admin, Inspector | Inspector only on assigned building |
| `GET /doors/:id/images` | Admin, Inspector | Inspector only on assigned building |
| `GET /doors/:id/images/:imageId/signed-download` | Admin, Inspector | Inspector only on assigned building |
| `POST /doors/:id/images/signed-upload` | Admin, Inspector | Inspector only on assigned building |
| `POST /doors/:id/images/register` | Admin, Inspector | Inspector only on assigned building |
| `POST /doors/:id/images/signed-upload/batch` | Admin, Inspector | Inspector only on assigned building |
| `POST /doors/:id/images/register/batch` | Admin, Inspector | Inspector only on assigned building |
| `DELETE /doors/:id/images/bulk` | Admin, Inspector | Admin can delete any; inspector only own uploads |
| `GET /doors/:id/certificate/signed-download` | Admin, Inspector | Inspector only on assigned building |
| `GET /buildings/:buildingId/surveys` | Admin, Inspector | Survey history for an accessible building |
| `GET /buildings/:buildingId/surveys/current` | Admin, Inspector | Current active survey |
| `GET /buildings/:buildingId/surveys/:surveyId` | Admin, Inspector | Survey detail/history |
| `POST /me/device-token` | Admin, Inspector | Register push token |

## Admin-Only Endpoints

These are the endpoints the admin portal should use for management and lifecycle control.

| Endpoint | Purpose |
|---|---|
| `PATCH /orgs/me` | Update organisation |
| `GET /users` | List users |
| `POST /users` | Create admin or inspector account |
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
| `POST /building-assignments` | Assign one building to inspector |
| `POST /building-assignments/bulk` | Assign many buildings to inspector |
| `POST /building-assignments/sites/:siteId` | Assign site buildings to inspector |
| `POST /building-assignments/buildings/:buildingId/reassign` | Reassign building |
| `GET /building-assignments/history` | Admin assignment/workflow history |
| `POST /buildings/:buildingId/surveys/:surveyId/reopen-fieldwork` | Reopen inspector-completed fieldwork |
| `POST /buildings/:buildingId/surveys/:surveyId/activate` | Activate planned survey |
| `POST /buildings/:buildingId/surveys/confirm-complete` | Confirm survey complete |
| `POST /buildings/:buildingId/surveys/start-next` | Create next planned survey |
| `PATCH /buildings/:buildingId/surveys/current/schedule` | Set next survey schedule |
| `POST /exports` | Create ZIP export |
| `GET /exports/:id` | Get export status |
| `GET /exports/:id/signed-download` | Get export download URL |

## Inspector-Only Endpoints

These are the endpoints the inspector app should use for invitation handling and fieldwork actions.

| Endpoint | Purpose |
|---|---|
| `GET /me/building-assignments` | List pending and accepted assignments |
| `GET /me/building-assignments/history` | Inspector assignment/workflow history |
| `POST /building-assignments/:assignmentId/respond` | Accept or decline one assignment |
| `POST /building-assignments/groups/:groupId/respond` | Accept or decline grouped site invitation |
| `POST /buildings/:id/approve` | Approve building before certificate stage |
| `POST /doors/:id/submit` | Submit door after images are uploaded |
| `POST /buildings/:buildingId/surveys/:surveyId/complete-fieldwork` | Mark active survey fieldwork complete |

## Recommended Fresh Flow

1. Admin login: `POST /auth/login`
2. Admin creates inspector: `POST /users`
3. Admin creates site: `POST /sites`
4. Admin creates building: `POST /buildings`
5. Admin assigns inspector: `POST /building-assignments`
6. Inspector login: `POST /auth/login`
7. Inspector checks invitation: `GET /me/building-assignments`
8. Inspector accepts invitation: `POST /building-assignments/:assignmentId/respond`
9. Inspector performs fieldwork: `POST /floors`, `POST /doors`, image upload/register endpoints, `POST /doors/:id/submit`
10. Inspector completes survey fieldwork: `POST /buildings/:buildingId/surveys/:surveyId/complete-fieldwork`
11. Admin reviews and finishes lifecycle: certificate endpoints, `POST /buildings/:buildingId/surveys/confirm-complete`, then `POST /buildings/:buildingId/surveys/start-next` when needed
