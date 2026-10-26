import "dotenv/config";
import { startTelemetry } from "./infrastructure/observability/telemetry.js";

startTelemetry("amrutam-worker");
await import("./worker.js");
