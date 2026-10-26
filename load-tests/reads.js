import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const doctorId = __ENV.DOCTOR_ID;
const readLatency = new Trend("amrutam_read_latency", true);

export const options = {
  scenarios: {
    doctor_reads: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.READ_RATE || 25),
      timeUnit: "1s",
      duration: __ENV.DURATION || "1m",
      preAllocatedVUs: 20,
      maxVUs: 100
    }
  },
  thresholds: {
    amrutam_read_latency: ["p(95)<200"],
    http_req_failed: ["rate<0.01"]
  }
};

export default function () {
  const list = http.get(`${baseUrl}/api/v1/doctors?limit=25`, { tags: { operation: "doctor-list" } });
  readLatency.add(list.timings.duration, { operation: "doctor-list" });
  check(list, { "doctor list is 200": (response) => response.status === 200 });

  if (!doctorId) return;
  const doctor = http.get(`${baseUrl}/api/v1/doctors/${doctorId}`, { tags: { operation: "doctor-detail" } });
  readLatency.add(doctor.timings.duration, { operation: "doctor-detail" });
  check(doctor, { "doctor detail is 200": (response) => response.status === 200 });

  const availability = http.get(`${baseUrl}/api/v1/doctors/${doctorId}/availability`, {
    tags: { operation: "doctor-availability" }
  });
  readLatency.add(availability.timings.duration, { operation: "doctor-availability" });
  check(availability, { "availability is 200": (response) => response.status === 200 });
}
