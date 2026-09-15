// @centralhub/service-kit — the shared toolkit for a first-party app
// backend (README §10e's "native gate" model). Everything a service under
// services/<name> needs that isn't its own business logic:
//
//   loadServiceConfig()           PORT / DATABASE_URL / AUTH_GATEWAY_URL
//   createPool(), connectWithRetry(), applyMigrations()
//   createAuth()                  authenticate + requireVerb middleware
//   hasVerb()                     in-handler conditional permission check
//   createNotifier()              app-originated platform notifications
//   healthRouter                  GET /health
//
// See services/_template for the canonical wiring and services/booking-api
// for a real consumer.
export { requireEnv, optionalEnv, loadServiceConfig, type ServiceConfig } from "./config.js";
export {
  createPool,
  connectWithRetry,
  applyMigrations,
  type Migration,
  type Queryable,
  type MigrationPool,
} from "./db.js";
export {
  createAuth,
  hasVerb,
  type AuthOptions,
  type AuthedRequest,
  type Identity,
  type PermissionSet,
  type Verb,
} from "./auth.js";
export { createNotifier, type NotifyInput, type NotifierOptions, type NotificationType } from "./notify.js";
export { healthRouter } from "./health.js";
