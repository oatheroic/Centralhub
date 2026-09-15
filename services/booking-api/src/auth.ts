import { createAuth, createNotifier } from "@centralhub/service-kit";
import { APP_ID, config } from "./config.js";

// This service is first-party, trusted code — per README §7's "Choosing an
// enforcement model" decision tree, it uses the native gate (auth-gateway's
// /session/context, via @centralhub/service-kit), not minted-JWT/RLS (that
// model exists for untrusted third-party apps like assets/engineering).
export const { authenticate, requireVerb } = createAuth({ appId: APP_ID, authGatewayUrl: config.authGatewayUrl });

export const notify = createNotifier({ appId: APP_ID, authGatewayUrl: config.authGatewayUrl });
