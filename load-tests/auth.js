import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const writeLatency = new Trend("amrutam_auth_write_latency", true);

export const options = {
  scenarios: {
    session_rotation: {
      executor: "shared-iterations",
      vus: Number(__ENV.VUS || 5),
      iterations: Number(__ENV.ITERATIONS || 10),
      maxDuration: __ENV.MAX_DURATION || "1m"
    }
  },
  thresholds: {
    amrutam_auth_write_latency: ["p(95)<500"],
    http_req_failed: ["rate<0.01"]
  }
};

export default function () {
  if (!__ENV.PATIENT_EMAIL || !__ENV.PATIENT_PASSWORD) {
    throw new Error("PATIENT_EMAIL and PATIENT_PASSWORD are required");
  }
  const headers = { "Content-Type": "application/json" };
  const login = http.post(`${baseUrl}/api/v1/auth/login`, JSON.stringify({
    email: __ENV.PATIENT_EMAIL,
    password: __ENV.PATIENT_PASSWORD
  }), { headers, tags: { operation: "login" } });
  writeLatency.add(login.timings.duration, { operation: "login" });
  check(login, { "login is 200": (response) => response.status === 200 });

  if (login.status === 200 && login.json("accessToken")) {
    const refresh = http.post(`${baseUrl}/api/v1/auth/refresh`, null, {
      headers,
      tags: { operation: "refresh" }
    });
    writeLatency.add(refresh.timings.duration, { operation: "refresh" });
    check(refresh, { "refresh is 200": (response) => response.status === 200 });
  }
  sleep(1);
}
