import { loadServiceConfig } from "@centralhub/service-kit";

// Must match the app's id everywhere else: the app-resource-booking /
// api-resource-booking compose services, the /apps/resource-booking/
// gateway route, and its app_permissions rows.
export const APP_ID = "resource-booking";

export const config = loadServiceConfig();
