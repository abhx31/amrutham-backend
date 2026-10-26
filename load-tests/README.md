# Performance tests

These k6 scenarios verify the assignment targets rather than claiming them without measurement:

- Public reads: p95 below 200 ms.
- Authentication and booking writes: p95 below 500 ms.
- Unexpected HTTP failures: below 1%.

Run against disposable seeded data. Booking requires one unique available slot per iteration.

```bash
k6 run -e BASE_URL=http://localhost:3000 -e DOCTOR_ID=<uuid> load-tests/reads.js
k6 run -e BASE_URL=http://localhost:3000 -e PATIENT_EMAIL=<email> -e PATIENT_PASSWORD=<password> load-tests/auth.js
k6 run -e BASE_URL=http://localhost:3000 -e PATIENT_ACCESS_TOKEN=<jwt> -e SLOT_IDS=<uuid,uuid> load-tests/booking.js
```

Use `READ_RATE`, `VUS`, `DURATION`, `ITERATIONS` and `RUN_ID` to tune a run. Do not point booking or authentication scenarios at production accounts without an approved test window. Commit dated result summaries separately; thresholds are acceptance gates, not evidence until a run completes.
