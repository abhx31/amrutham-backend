import "dotenv/config";
import { startTelemetry } from "./infrastructure/observability/telemetry.js";

startTelemetry("amrutam-api");
await import("./server.js");
