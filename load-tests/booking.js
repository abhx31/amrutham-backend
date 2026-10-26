import http from "k6/http";
import exec from "k6/execution";
import { check } from "k6";
import { Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const slotIds = (__ENV.SLOT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
const writeLatency = new Trend("amrutam_booking_write_latency", true);

export const options = {
  scenarios: {
    concurrent_booking: {
      executor: "shared-iterations",
      vus: Number(__ENV.VUS || 10),
      iterations: Number(__ENV.ITERATIONS || slotIds.length || 1),
      maxDuration: __ENV.MAX_DURATION || "1m"
    }
  },
  thresholds: {
    amrutam_booking_write_latency: ["p(95)<500"],
    http_req_failed: ["rate<0.01"]
  }
};

export default function () {
  if (!__ENV.PATIENT_ACCESS_TOKEN || slotIds.length === 0) {
    throw new Error("PATIENT_ACCESS_TOKEN and comma-separated SLOT_IDS are required");
  }
  const index = exec.scenario.iterationInTest;
  const slotId = slotIds[index % slotIds.length];
  const response = http.post(`${baseUrl}/api/v1/consultations`, JSON.stringify({
    slotId,
    reason: "Performance-test consultation"
  }), {
    headers: {
      Authorization: `Bearer ${__ENV.PATIENT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `k6-booking-${__ENV.RUN_ID || Date.now()}-${index}`
    },
    tags: { operation: "consultation-booking" }
  });
  writeLatency.add(response.timings.duration, { operation: "consultation-booking" });
  check(response, { "booking is created": (result) => result.status === 201 });
}
