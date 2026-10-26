const bearer = [{ bearerAuth: [] }];
const json = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } }
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (description: string, schema?: unknown) => ({
  description,
  ...(schema ? { content: { "application/json": { schema } } } : {})
});
const idParam = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" }
});
const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description: "Unique key reused only when retrying the same operation.",
  schema: { type: "string", minLength: 8, maxLength: 200 }
};
const errors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "409": { $ref: "#/components/responses/Conflict" },
  "429": { $ref: "#/components/responses/RateLimited" }
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Amrutam Telemedicine API",
    version: "1.0.0",
    description: "Production-oriented REST API for identity, doctors, booking, consultations, prescriptions, payments, audit, and analytics."
  },
  servers: [{ url: "/api/v1", description: "Current API version" }],
  tags: [
    "Health", "Authentication", "MFA", "Accounts", "Users", "Profiles", "Doctors",
    "Consultations", "Prescriptions", "Payments", "Audit", "Analytics", "Administration"
  ].map((name) => ({ name })),
  paths: {
    "/health/live": {
      get: { tags: ["Health"], summary: "Process liveness", responses: { "200": response("Process is alive", ref("Health")) } }
    },
    "/health/ready": {
      get: { tags: ["Health"], summary: "Dependency readiness", responses: {
        "200": response("Service is ready", ref("Readiness")),
        "503": response("A required dependency is unavailable", ref("Readiness"))
      } }
    },
    "/auth/register": {
      post: { tags: ["Authentication"], summary: "Register a patient", requestBody: json(ref("RegisterRequest")), responses: {
        "201": response("Patient registered", ref("SessionResponse")), ...errors
      } }
    },
    "/auth/login": {
      post: { tags: ["Authentication"], summary: "Password login", description: "Returns a session or a five-minute MFA challenge.", requestBody: json(ref("LoginRequest")), responses: {
        "200": response("Session or MFA challenge", { oneOf: [ref("SessionResponse"), ref("MfaChallenge")] }), ...errors
      } }
    },
    "/auth/refresh": {
      post: { tags: ["Authentication"], summary: "Rotate refresh token", security: [{ refreshCookie: [] }], responses: {
        "200": response("Session refreshed", ref("SessionResponse")), ...errors
      } }
    },
    "/auth/logout": {
      post: { tags: ["Authentication"], summary: "Revoke current refresh token", responses: { "204": response("Logged out") } }
    },
    "/auth/logout-all": {
      post: { tags: ["Authentication"], summary: "Revoke all sessions", security: bearer, responses: { "204": response("All sessions revoked"), ...errors } }
    },
    "/auth/me": {
      get: { tags: ["Authentication"], summary: "Current authenticated user", security: bearer, responses: {
        "200": response("Current user", { type: "object", properties: { user: ref("User") } }), ...errors
      } }
    },
    "/auth/mfa/setup": {
      post: { tags: ["MFA"], summary: "Begin TOTP enrollment", security: bearer, responses: {
        "200": response("Enrollment secret", ref("MfaSetupResponse")), ...errors
      } }
    },
    "/auth/mfa/verify-setup": {
      post: { tags: ["MFA"], summary: "Activate MFA", security: bearer, requestBody: json(ref("TotpCode")), responses: {
        "200": response("MFA activated; recovery codes are returned once", ref("MfaSetupVerifiedResponse")), ...errors
      } }
    },
    "/auth/mfa/verify-login": {
      post: { tags: ["MFA"], summary: "Complete MFA login", requestBody: json(ref("MfaLoginRequest")), responses: {
        "200": response("Authenticated session", ref("SessionResponse")), ...errors
      } }
    },
    "/auth/mfa": {
      delete: { tags: ["MFA"], summary: "Disable optional patient MFA", security: bearer, requestBody: json(ref("DisableMfaRequest")), responses: {
        "204": response("MFA disabled"), ...errors
      } }
    },
    "/auth/forgot-password": {
      post: { tags: ["Accounts"], summary: "Request password reset", requestBody: json(ref("EmailRequest")), responses: {
        "202": response("Request accepted"), ...errors
      } }
    },
    "/auth/reset-password": {
      post: { tags: ["Accounts"], summary: "Reset password", requestBody: json(ref("ResetPasswordRequest")), responses: {
        "204": response("Password reset"), ...errors
      } }
    },
    "/auth/change-password": {
      post: { tags: ["Accounts"], summary: "Change current password", security: bearer, requestBody: json(ref("ChangePasswordRequest")), responses: {
        "204": response("Password changed and sessions revoked"), ...errors
      } }
    },
    "/auth/request-email-verification": {
      post: { tags: ["Accounts"], summary: "Request email verification", requestBody: json(ref("EmailRequest")), responses: {
        "202": response("Request accepted"), ...errors
      } }
    },
    "/auth/verify-email": {
      post: { tags: ["Accounts"], summary: "Verify email address", requestBody: json(ref("TokenRequest")), responses: {
        "204": response("Email verified"), ...errors
      } }
    },
    "/auth/sessions": {
      get: { tags: ["Accounts"], summary: "List refresh-token sessions", security: bearer, responses: {
        "200": response("Sessions", { type: "object", properties: { items: { type: "array", items: ref("Session") } } }), ...errors
      } }
    },
    "/auth/sessions/{sessionId}": {
      delete: { tags: ["Accounts"], summary: "Revoke one session", security: bearer, parameters: [idParam("sessionId")], responses: {
        "204": response("Session revoked"), "404": { $ref: "#/components/responses/NotFound" }, ...errors
      } }
    },
    "/users/me": {
      get: { tags: ["Users"], summary: "Current user account", security: bearer, responses: {
        "200": response("User", { type: "object", properties: { user: ref("User") } }), ...errors
      } }
    },
    "/users/me/profile": {
      patch: { tags: ["Users"], summary: "Update basic profile", security: bearer, requestBody: json(ref("BasicProfileUpdate")), responses: {
        "200": response("Updated user", { type: "object", properties: { user: ref("User") } }), ...errors
      } }
    },
    "/users": {
      get: { tags: ["Users"], summary: "List users", description: "Admin only.", security: bearer, parameters: [
        { name: "role", in: "query", schema: ref("UserRole") },
        { name: "status", in: "query", schema: ref("UserStatus") },
        { name: "search", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
        { name: "cursor", in: "query", schema: { type: "string" } }
      ], responses: { "200": response("Users", ref("UserList")), ...errors } }
    },
    "/users/{userId}": {
      get: { tags: ["Users"], summary: "Get user", description: "Admin only.", security: bearer, parameters: [idParam("userId")], responses: {
        "200": response("User", { type: "object", properties: { user: ref("User") } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors
      } }
    },
    "/users/{userId}/status": {
      patch: { tags: ["Users"], summary: "Activate or suspend user", description: "Admin only.", security: bearer, parameters: [idParam("userId")], requestBody: json(ref("UserStatusUpdate")), responses: {
        "200": response("Updated user", { type: "object", properties: { user: ref("User") } }), ...errors
      } }
    },
    "/profiles/me": {
      get: { tags: ["Profiles"], summary: "Get personal profile", security: bearer, responses: {
        "200": response("Profile", { type: "object", properties: { profile: ref("Profile") } }), ...errors
      } },
      patch: { tags: ["Profiles"], summary: "Update personal profile", security: bearer, requestBody: json(ref("ProfileUpdate")), responses: {
        "200": response("Updated profile", { type: "object", properties: { profile: ref("Profile") } }), ...errors
      } }
    },
    "/profiles/{userId}": {
      get: { tags: ["Profiles"], summary: "Get user profile", description: "Admin only.", security: bearer, parameters: [idParam("userId")], responses: {
        "200": response("Profile", { type: "object", properties: { profile: ref("Profile") } }), ...errors
      } }
    },
    "/doctors": {
      get: { tags: ["Doctors"], summary: "Search verified doctors", parameters: [
        { name: "specialty", in: "query", schema: { type: "string" } },
        { name: "search", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
        { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
      ], responses: { "200": response("Doctors", { type: "object", properties: { items: { type: "array", items: ref("Doctor") } } }) } },
      post: { tags: ["Doctors"], summary: "Onboard doctor", description: "Admin only.", security: bearer, requestBody: json(ref("CreateDoctorRequest")), responses: {
        "201": response("Doctor created", { type: "object", properties: { doctor: ref("Doctor") } }), ...errors
      } }
    },
    "/doctors/me": {
      get: { tags: ["Doctors"], summary: "Get own doctor profile", security: bearer, responses: { "200": response("Doctor", { type: "object", properties: { doctor: ref("Doctor") } }), ...errors } },
      patch: { tags: ["Doctors"], summary: "Update own doctor profile", security: bearer, requestBody: json(ref("UpdateDoctorRequest")), responses: { "200": response("Doctor", { type: "object", properties: { doctor: ref("Doctor") } }), ...errors } }
    },
    "/doctors/me/availability": {
      get: { tags: ["Doctors"], summary: "List own availability", security: bearer, parameters: availabilityQueryParameters(true), responses: { "200": response("Slots", ref("AvailabilityList")), ...errors } },
      post: { tags: ["Doctors"], summary: "Create availability", security: bearer, requestBody: json(ref("AvailabilityRequest")), responses: { "201": response("Slot created", { type: "object", properties: { slot: ref("Availability") } }), ...errors } }
    },
    "/doctors/me/availability/{slotId}": {
      patch: { tags: ["Doctors"], summary: "Update owned availability", security: bearer, parameters: [idParam("slotId")], requestBody: json(ref("AvailabilityRequest")), responses: { "200": response("Slot updated", { type: "object", properties: { slot: ref("Availability") } }), ...errors } },
      delete: { tags: ["Doctors"], summary: "Block owned availability", security: bearer, parameters: [idParam("slotId")], responses: { "204": response("Slot blocked"), ...errors } }
    },
    "/doctors/{doctorId}": {
      get: { tags: ["Doctors"], summary: "Get verified doctor", parameters: [idParam("doctorId")], responses: { "200": response("Doctor", { type: "object", properties: { doctor: ref("Doctor") } }), "404": { $ref: "#/components/responses/NotFound" } } }
    },
    "/doctors/{doctorId}/availability": {
      get: { tags: ["Doctors"], summary: "List public availability", parameters: [idParam("doctorId"), ...availabilityQueryParameters(false)], responses: { "200": response("Slots", ref("AvailabilityList")) } }
    },
    "/doctors/{doctorId}/verification": {
      patch: { tags: ["Doctors"], summary: "Change doctor verification", description: "Admin only.", security: bearer, parameters: [idParam("doctorId")], requestBody: json(ref("DoctorVerificationRequest")), responses: { "200": response("Doctor", { type: "object", properties: { doctor: ref("Doctor") } }), ...errors } }
    },
    "/consultations": {
      post: { tags: ["Consultations"], summary: "Book consultation", description: "Patient only.", security: bearer, parameters: [idempotencyHeader], requestBody: json(ref("CreateConsultationRequest")), responses: { "201": response("Consultation booked", ref("ConsultationEnvelope")), "200": response("Idempotent replay", ref("ConsultationEnvelope")), ...errors } },
      get: { tags: ["Consultations"], summary: "List actor consultations", security: bearer, parameters: [
        { name: "status", in: "query", schema: ref("ConsultationStatus") },
        { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
        { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
      ], responses: { "200": response("Consultations", { type: "object", properties: { items: { type: "array", items: ref("Consultation") } } }), ...errors } }
    },
    "/consultations/{consultationId}": {
      get: { tags: ["Consultations"], summary: "Get consultation", security: bearer, parameters: [idParam("consultationId")], responses: { "200": response("Consultation", ref("ConsultationEnvelope")), "404": { $ref: "#/components/responses/NotFound" }, ...errors } }
    },
    "/consultations/{consultationId}/status": {
      patch: { tags: ["Consultations"], summary: "Transition consultation", security: bearer, parameters: [idParam("consultationId")], requestBody: json(ref("ConsultationTransitionRequest")), responses: { "200": response("Consultation updated", ref("ConsultationEnvelope")), ...errors } }
    },
    "/consultations/{consultationId}/cancel": {
      post: { tags: ["Consultations"], summary: "Cancel consultation", description: "Owning patient only.", security: bearer, parameters: [idParam("consultationId")], requestBody: json(ref("ConsultationCancelRequest")), responses: { "200": response("Consultation cancelled", ref("ConsultationEnvelope")), ...errors } }
    },
    "/consultations/{consultationId}/prescriptions": {
      get: { tags: ["Prescriptions"], summary: "List consultation prescriptions", security: bearer, parameters: [idParam("consultationId")], responses: { "200": response("Prescriptions", { type: "object", properties: { items: { type: "array", items: ref("Prescription") } } }), ...errors } },
      post: { tags: ["Prescriptions"], summary: "Create prescription draft", security: bearer, parameters: [idParam("consultationId")], requestBody: json(ref("PrescriptionRequest")), responses: { "201": response("Draft created", { type: "object", properties: { prescription: ref("Prescription") } }), ...errors } }
    },
    "/prescriptions/{prescriptionId}": {
      get: { tags: ["Prescriptions"], summary: "Get prescription", security: bearer, parameters: [idParam("prescriptionId")], responses: { "200": response("Prescription", { type: "object", properties: { prescription: ref("Prescription") } }), "404": { $ref: "#/components/responses/NotFound" }, ...errors } },
      patch: { tags: ["Prescriptions"], summary: "Update prescription draft", security: bearer, parameters: [idParam("prescriptionId")], requestBody: json(ref("PrescriptionUpdateRequest")), responses: { "200": response("Draft updated", { type: "object", properties: { prescription: ref("Prescription") } }), ...errors } }
    },
    "/prescriptions/{prescriptionId}/finalize": {
      post: { tags: ["Prescriptions"], summary: "Finalize prescription", security: bearer, parameters: [idParam("prescriptionId")], responses: { "200": response("Prescription finalized", { type: "object", properties: { prescription: ref("Prescription") } }), ...errors } }
    },
    "/consultations/{consultationId}/payments": {
      post: { tags: ["Payments"], summary: "Initiate payment", security: bearer, parameters: [idParam("consultationId"), idempotencyHeader], responses: { "201": response("Payment initiated", ref("PaymentCheckoutResponse")), "200": response("Idempotent replay", ref("PaymentCheckoutResponse")), ...errors } },
      get: { tags: ["Payments"], summary: "List consultation payments", security: bearer, parameters: [idParam("consultationId")], responses: { "200": response("Payments", { type: "object", properties: { items: { type: "array", items: ref("Payment") } } }), ...errors } }
    },
    "/payments/{paymentId}": {
      get: { tags: ["Payments"], summary: "Get payment", security: bearer, parameters: [idParam("paymentId")], responses: { "200": response("Payment", { type: "object", properties: { payment: ref("Payment") } }), ...errors } }
    },
    "/payments/webhooks/provider": {
      post: { tags: ["Payments"], summary: "Process signed provider webhook", parameters: [{ name: "x-payment-signature", in: "header", required: true, schema: { type: "string" } }], requestBody: json(ref("PaymentWebhook")), responses: { "200": response("Webhook accepted"), ...errors } }
    },
    "/dev/payments/{paymentId}": {
      post: { tags: ["Payments"], summary: "Simulate fake payment result", description: "Admin only and disabled in production.", security: bearer, parameters: [idParam("paymentId")], requestBody: json(ref("FakePaymentRequest")), responses: { "200": response("Payment updated", { type: "object", properties: { payment: ref("Payment") } }), ...errors } }
    },
    "/audit-logs": {
      get: { tags: ["Audit"], summary: "Search audit logs", description: "Admin only.", security: bearer, parameters: auditQueryParameters(), responses: { "200": response("Audit logs", { type: "object", properties: { items: { type: "array", items: ref("AuditLog") } } }), ...errors } }
    },
    "/audit-logs/{auditLogId}": {
      get: { tags: ["Audit"], summary: "Get audit log", description: "Admin only.", security: bearer, parameters: [idParam("auditLogId")], responses: { "200": response("Audit log", { type: "object", properties: { auditLog: ref("AuditLog") } }), ...errors } }
    },
    "/admin/analytics/overview": analyticsOperation("Overview KPIs"),
    "/admin/analytics/consultations": analyticsOperation("Daily consultation trends"),
    "/admin/analytics/doctors": analyticsOperation("Doctor utilization"),
    "/admin/analytics/payments": analyticsOperation("Daily payment trends"),
    "/admin/doctors/pending": {
      get: { tags: ["Administration"], summary: "List unverified doctors", security: bearer, parameters: paginationParameters(), responses: { "200": response("Pending doctors", { type: "object", properties: { items: { type: "array", items: ref("Doctor") } } }), ...errors } }
    },
    "/admin/users": {
      post: { tags: ["Administration"], summary: "Create patient or administrator", security: bearer, requestBody: json(ref("AdminCreateUserRequest")), responses: { "201": response("User created", { type: "object", properties: { user: ref("User") } }), ...errors } }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "amrutam_refresh" }
    },
    responses: {
      BadRequest: response("Invalid request", ref("ErrorResponse")),
      Unauthorized: response("Authentication failed", ref("ErrorResponse")),
      Forbidden: response("Insufficient permission", ref("ErrorResponse")),
      NotFound: response("Resource not found", ref("ErrorResponse")),
      Conflict: response("State or concurrency conflict", ref("ErrorResponse")),
      RateLimited: response("Rate limit exceeded", ref("ErrorResponse"))
    },
    schemas: schemas()
  }
} as const;

function schemas() {
  const uuid = { type: "string", format: "uuid" };
  const dateTime = { type: "string", format: "date-time" };
  const nullableString = { type: ["string", "null"] };
  const userRole = { type: "string", enum: ["PATIENT", "DOCTOR", "ADMIN"] };
  const userStatus = { type: "string", enum: ["PENDING", "ACTIVE", "SUSPENDED"] };
  const medication = { type: "object", required: ["name", "dosage", "frequency", "duration"], properties: {
    name: { type: "string" }, dosage: { type: "string" }, frequency: { type: "string" }, duration: { type: "string" }, instructions: { type: "string" }
  } };
  return {
    UserRole: userRole,
    UserStatus: userStatus,
    ConsultationStatus: { type: "string", enum: ["BOOKED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] },
    ErrorResponse: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, details: {} } }, requestId: { type: ["string", "number"] } } },
    Health: { type: "object", properties: { status: { const: "ok" } } },
    Readiness: { type: "object", properties: { status: { type: "string" }, checks: { type: "object", properties: { database: { enum: ["up", "down"] } } } } },
    RegisterRequest: { type: "object", additionalProperties: false, required: ["email", "password", "firstName", "lastName"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password", minLength: 12 }, firstName: { type: "string" }, lastName: { type: "string" }, phone: { type: "string" } } },
    LoginRequest: { type: "object", additionalProperties: false, required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" } } },
    User: { type: "object", required: ["id", "email", "role", "status", "firstName", "lastName"], properties: { id: uuid, email: { type: "string", format: "email" }, role: userRole, status: userStatus, firstName: { type: "string" }, lastName: { type: "string" }, phone: nullableString, createdAt: dateTime, updatedAt: dateTime } },
    SessionResponse: { type: "object", required: ["accessToken", "tokenType", "expiresIn", "user"], properties: { accessToken: { type: "string" }, tokenType: { const: "Bearer" }, expiresIn: { type: "integer" }, user: ref("User") } },
    MfaChallenge: { type: "object", required: ["mfaRequired", "mfaSetupRequired", "challengeToken", "expiresIn"], properties: { mfaRequired: { type: "boolean" }, mfaSetupRequired: { type: "boolean" }, challengeToken: { type: "string" }, expiresIn: { const: 300 } } },
    MfaSetupResponse: { type: "object", required: ["secret", "otpauthUri"], properties: { secret: { type: "string" }, otpauthUri: { type: "string", format: "uri" } } },
    TotpCode: { type: "object", additionalProperties: false, required: ["code"], properties: { code: { type: "string", pattern: "^[0-9]{6}$" } } },
    MfaSetupVerifiedResponse: { allOf: [ref("SessionResponse"), { type: "object", properties: { recoveryCodes: { type: "array", items: { type: "string" } } } }] },
    MfaLoginRequest: { type: "object", additionalProperties: false, required: ["challengeToken"], properties: { challengeToken: { type: "string" }, code: { type: "string", pattern: "^[0-9]{6}$" }, recoveryCode: { type: "string" } } },
    DisableMfaRequest: { type: "object", required: ["password", "code"], properties: { password: { type: "string", format: "password" }, code: { type: "string", pattern: "^[0-9]{6}$" } } },
    EmailRequest: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
    TokenRequest: { type: "object", required: ["token"], properties: { token: { type: "string" } } },
    ResetPasswordRequest: { type: "object", required: ["token", "newPassword"], properties: { token: { type: "string" }, newPassword: { type: "string", format: "password", minLength: 12 } } },
    ChangePasswordRequest: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string", format: "password" }, newPassword: { type: "string", format: "password", minLength: 12 } } },
    Session: { type: "object", properties: { id: uuid, createdAt: dateTime, lastUsedAt: { anyOf: [dateTime, { type: "null" }] }, expiresAt: dateTime, revokedAt: { anyOf: [dateTime, { type: "null" }] } } },
    BasicProfileUpdate: { type: "object", additionalProperties: false, minProperties: 1, properties: { firstName: { type: "string" }, lastName: { type: "string" }, phone: nullableString } },
    UserList: { type: "object", properties: { items: { type: "array", items: ref("User") }, nextCursor: nullableString } },
    UserStatusUpdate: { type: "object", required: ["status", "reason"], properties: { status: { enum: ["ACTIVE", "SUSPENDED"] }, reason: { type: "string" } } },
    Address: { type: "object", required: ["line1", "city", "state", "postalCode", "country"], properties: { line1: { type: "string" }, line2: { type: "string" }, city: { type: "string" }, state: { type: "string" }, postalCode: { type: "string" }, country: { type: "string", minLength: 2, maxLength: 2 } } },
    EmergencyContact: { type: "object", required: ["name", "relationship", "phone"], properties: { name: { type: "string" }, relationship: { type: "string" }, phone: { type: "string" } } },
    Profile: { type: "object", properties: { userId: uuid, email: { type: "string", format: "email" }, firstName: { type: "string" }, lastName: { type: "string" }, phone: nullableString, dateOfBirth: { type: ["string", "null"], format: "date" }, gender: nullableString, address: { anyOf: [ref("Address"), { type: "null" }] }, emergencyContact: { anyOf: [ref("EmergencyContact"), { type: "null" }] }, createdAt: dateTime, updatedAt: dateTime } },
    ProfileUpdate: { type: "object", additionalProperties: false, minProperties: 1, properties: { firstName: { type: "string" }, lastName: { type: "string" }, phone: nullableString, dateOfBirth: { type: ["string", "null"], format: "date" }, gender: nullableString, address: { anyOf: [ref("Address"), { type: "null" }] }, emergencyContact: { anyOf: [ref("EmergencyContact"), { type: "null" }] } } },
    Doctor: { type: "object", properties: { id: uuid, userId: uuid, firstName: { type: "string" }, lastName: { type: "string" }, specialty: { type: "string" }, consultationFeeMinor: { type: "integer" }, bio: nullableString, verified: { type: "boolean" }, createdAt: dateTime, updatedAt: dateTime } },
    CreateDoctorRequest: { type: "object", required: ["userId", "licenseNumber", "specialty", "consultationFeeMinor"], properties: { userId: uuid, licenseNumber: { type: "string" }, specialty: { type: "string" }, consultationFeeMinor: { type: "integer", minimum: 0 }, bio: { type: "string" } } },
    UpdateDoctorRequest: { type: "object", minProperties: 1, properties: { specialty: { type: "string" }, consultationFeeMinor: { type: "integer", minimum: 0 }, bio: nullableString } },
    DoctorVerificationRequest: { type: "object", required: ["verified", "reason"], properties: { verified: { type: "boolean" }, reason: { type: "string" } } },
    Availability: { type: "object", properties: { id: uuid, doctorId: uuid, startsAt: dateTime, endsAt: dateTime, status: { enum: ["AVAILABLE", "BOOKED", "BLOCKED"] }, version: { type: "integer" } } },
    AvailabilityRequest: { type: "object", required: ["startsAt", "endsAt"], properties: { startsAt: dateTime, endsAt: dateTime } },
    AvailabilityList: { type: "object", properties: { items: { type: "array", items: ref("Availability") } } },
    CreateConsultationRequest: { type: "object", required: ["slotId"], properties: { slotId: uuid, reason: { type: "string" } } },
    Consultation: { type: "object", properties: { id: uuid, slotId: uuid, doctorId: uuid, doctorUserId: uuid, doctorName: { type: "string" }, patientId: uuid, status: ref("ConsultationStatus"), reason: nullableString, cancellationReason: nullableString, startsAt: dateTime, endsAt: dateTime, version: { type: "integer" }, createdAt: dateTime, updatedAt: dateTime } },
    ConsultationEnvelope: { type: "object", properties: { consultation: ref("Consultation") } },
    ConsultationTransitionRequest: { type: "object", required: ["status", "version"], properties: { status: { enum: ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] }, version: { type: "integer", minimum: 1 } } },
    ConsultationCancelRequest: { type: "object", required: ["version", "reason"], properties: { version: { type: "integer", minimum: 1 }, reason: { type: "string" } } },
    Medication: medication,
    PrescriptionRequest: { type: "object", required: ["medications"], properties: { medications: { type: "array", minItems: 1, items: medication }, notes: { type: "string" } } },
    PrescriptionUpdateRequest: { type: "object", minProperties: 1, properties: { medications: { type: "array", minItems: 1, items: medication }, notes: nullableString } },
    Prescription: { type: "object", properties: { id: uuid, consultationId: uuid, doctorId: uuid, version: { type: "integer" }, status: { enum: ["DRAFT", "FINAL"] }, medications: { type: "array", items: medication }, notes: nullableString, finalizedAt: { anyOf: [dateTime, { type: "null" }] }, createdAt: dateTime, updatedAt: dateTime } },
    Payment: { type: "object", properties: { id: uuid, consultationId: uuid, providerReference: nullableString, amountMinor: { type: "integer" }, currency: { type: "string" }, status: { enum: ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"] }, completedAt: { anyOf: [dateTime, { type: "null" }] }, refundedAt: { anyOf: [dateTime, { type: "null" }] } } },
    Checkout: { type: "object", properties: { provider: { type: "string" }, orderId: { type: "string" }, checkoutUrl: { type: "string" }, testMode: { type: "boolean" } } },
    PaymentCheckoutResponse: { type: "object", properties: { payment: ref("Payment"), checkout: ref("Checkout") } },
    PaymentWebhook: { type: "object", required: ["eventId", "paymentId", "providerReference", "status"], properties: { eventId: { type: "string" }, paymentId: uuid, providerReference: { type: "string" }, status: { enum: ["SUCCEEDED", "FAILED", "REFUNDED"] } } },
    FakePaymentRequest: { type: "object", required: ["status"], properties: { status: { enum: ["SUCCEEDED", "FAILED", "REFUNDED"] } } },
    AuditLog: { type: "object", properties: { id: uuid, actorId: { anyOf: [uuid, { type: "null" }] }, action: { type: "string" }, entityType: { type: "string" }, entityId: { anyOf: [uuid, { type: "null" }] }, requestId: nullableString, metadata: { type: ["object", "null"], additionalProperties: true }, createdAt: dateTime } },
    AdminCreateUserRequest: { type: "object", required: ["email", "password", "role", "firstName", "lastName"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password", minLength: 12 }, role: { enum: ["PATIENT", "ADMIN"] }, firstName: { type: "string" }, lastName: { type: "string" }, phone: { type: "string" }, emailVerified: { type: "boolean", default: false } } }
  };
}

function availabilityQueryParameters(includeStatus: boolean) {
  return [
    { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
    ...(includeStatus ? [{ name: "status", in: "query", schema: { enum: ["AVAILABLE", "BOOKED", "BLOCKED"] } }] : []),
    { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 } }
  ];
}

function analyticsOperation(summary: string) {
  return { get: { tags: ["Analytics"], summary, security: bearer, parameters: [
    { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } }
  ], responses: { "200": response("Aggregate analytics result"), ...errors } } };
}

function auditQueryParameters() {
  return [
    { name: "actorId", in: "query", schema: { type: "string", format: "uuid" } },
    { name: "action", in: "query", schema: { type: "string" } },
    { name: "entityType", in: "query", schema: { type: "string" } },
    { name: "entityId", in: "query", schema: { type: "string", format: "uuid" } },
    { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
    ...paginationParameters()
  ];
}

function paginationParameters() {
  return [
    { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
    { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
  ];
}
