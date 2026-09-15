import { createAuth, createNotifier } from "@centralhub/service-kit";
import { APP_ID, config } from "./config.js";

// Native-gate enforcement (README §7): this is trusted first-party code, so
// it checks permissions against auth-gateway directly rather than the
// minted-JWT/RLS model used for third-party ingestions (assets/engineering).
export const { authenticate, requireVerb } = createAuth({ appId: APP_ID, authGatewayUrl: config.authGatewayUrl });

// App-originated platform notifications (README §16) — shows up in every
// app's bell. Fire-and-forget; never fails the calling request.
export const notify = createNotifier({ appId: APP_ID, authGatewayUrl: config.authGatewayUrl });
