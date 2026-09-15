import { createPool } from "@centralhub/service-kit";
import { config } from "./config.js";

export const pool = createPool(config.databaseUrl);
