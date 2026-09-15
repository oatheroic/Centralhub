import { loadServiceConfig } from "@centralhub/service-kit";

// Must match the app's id everywhere else: the app-<id> / api-<id> compose
// services, the /apps/<id>/ gateway route, and its app_permissions rows.
export const APP_ID = "_template";

// Used as the log prefix — set it to the service folder name.
export const SERVICE_NAME = "template-api";

// PORT (default 4200), DATABASE_URL, AUTH_GATEWAY_URL — see the api-<id>
// compose block. Add service-specific extras here with requireEnv().
export const config = loadServiceConfig();
