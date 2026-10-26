import { describe, expect, it, vi } from "vitest";
import { AccountNotificationHandler } from "../src/infrastructure/notifications/account-notification.handler.js";
import type { EmailProvider } from "../src/infrastructure/notifications/email.provider.js";
import type { NotificationRecipientRepository } from "../src/infrastructure/notifications/notification.repository.js";
import { DomainNotificationHandler } from "../src/infrastructure/notifications/domain-notification.handler.js";

const event = {
  id: "9ec0c27f-c564-48ff-9204-d163e153576c",
  eventType: "account.password_reset_requested",
  aggregateType: "user",
  aggregateId: "d6ec5657-58dd-46a8-a491-d000375d366f",
  payload: {
    tokenId: "e56b506c-f1d3-466d-93c5-d6c6f7c51433",
    encryptedToken: "encrypted"
  },
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("account notification handler", () => {
  it("decrypts the token and builds a password-reset email", async () => {
    const recipients: NotificationRecipientRepository = {
      findEmail: vi.fn().mockResolvedValue("patient@example.com"),
      findConsultationRecipients: vi.fn()
    };
    const email: EmailProvider = {
      send: vi.fn().mockResolvedValue({ messageId: "message-1" })
    };
    const decryptor = { decrypt: vi.fn().mockReturnValue("raw token/with symbols") };
    const handler = new AccountNotificationHandler(recipients, email, decryptor, "https://app.amrutam.test");

    await handler.handle(event);

    expect(recipients.findEmail).toHaveBeenCalledWith(event.aggregateId);
    expect(decryptor.decrypt).toHaveBeenCalledWith("encrypted");
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "patient@example.com",
      subject: "Reset your Amrutam password",
      eventId: event.id,
      text: expect.stringContaining("token=raw+token%2Fwith+symbols")
    }));
  });

  it("fails unsupported account events so BullMQ can retry or quarantine them", async () => {
    const handler = new AccountNotificationHandler(
      { findEmail: vi.fn(), findConsultationRecipients: vi.fn() },
      { send: vi.fn() },
      { decrypt: vi.fn() },
      "https://app.amrutam.test"
    );

    await expect(handler.handle({ ...event, eventType: "account.unknown" })).rejects.toThrow("Unsupported account notification event");
  });

  it("notifies both participants when a consultation is booked", async () => {
    const recipients: NotificationRecipientRepository = {
      findEmail: vi.fn(),
      findConsultationRecipients: vi.fn().mockResolvedValue({
        patientEmail: "patient@example.com",
        doctorEmail: "doctor@example.com"
      })
    };
    const email: EmailProvider = { send: vi.fn().mockResolvedValue({ messageId: "message" }) };
    const handler = new DomainNotificationHandler(recipients, email, "https://app.amrutam.test");
    const consultationId = "e56b506c-f1d3-466d-93c5-d6c6f7c51433";

    await handler.handle({
      ...event,
      eventType: "consultation.booked",
      aggregateType: "consultation",
      aggregateId: consultationId,
      payload: { consultationId }
    });

    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "patient@example.com",
      eventId: `${event.id}-patient`
    }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "doctor@example.com",
      eventId: `${event.id}-doctor`
    }));
  });

  it("sends payment and prescription updates only to the patient", async () => {
    const recipients: NotificationRecipientRepository = {
      findEmail: vi.fn(),
      findConsultationRecipients: vi.fn().mockResolvedValue({
        patientEmail: "patient@example.com",
        doctorEmail: "doctor@example.com"
      })
    };
    const email: EmailProvider = { send: vi.fn().mockResolvedValue({ messageId: "message" }) };
    const handler = new DomainNotificationHandler(recipients, email, "https://app.amrutam.test");
    const consultationId = "e56b506c-f1d3-466d-93c5-d6c6f7c51433";

    await handler.handle({ ...event, eventType: "payment.status_changed", payload: { consultationId, status: "SUCCEEDED" } });
    await handler.handle({ ...event, eventType: "prescription.finalized", payload: { consultationId } });

    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      to: "patient@example.com",
      subject: "Payment status updated"
    }));
    expect(email.send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      to: "patient@example.com",
      subject: "Your prescription is ready"
    }));
  });
});
