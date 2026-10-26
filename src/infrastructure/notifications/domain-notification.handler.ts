import { z } from "zod";
import type { DomainEventHandler, OutboxJobData } from "../outbox/outbox.types.js";
import type { EmailProvider } from "./email.provider.js";
import type { NotificationRecipientRepository } from "./notification.repository.js";

const consultationPayload = z.object({ consultationId: z.string().uuid() }).passthrough();
const statusPayload = consultationPayload.extend({ status: z.string().min(1).max(40) });

export class DomainNotificationHandler implements DomainEventHandler {
  constructor(
    private readonly recipients: NotificationRecipientRepository,
    private readonly email: EmailProvider,
    private readonly publicUrl: string
  ) {}

  async handle(event: OutboxJobData): Promise<void> {
    if (event.eventType === "consultation.booked") return this.consultationBooked(event);
    if (event.eventType === "consultation.status_changed") return this.consultationStatusChanged(event);
    if (event.eventType === "payment.status_changed") return this.paymentStatusChanged(event);
    if (event.eventType === "prescription.finalized") return this.prescriptionFinalized(event);
    throw new Error(`Unsupported domain notification event: ${event.eventType}`);
  }

  private async consultationBooked(event: OutboxJobData): Promise<void> {
    const { consultationId } = consultationPayload.parse(event.payload);
    const recipients = await this.requireRecipients(consultationId);
    const url = this.consultationUrl(consultationId);
    await Promise.all([
      this.send(recipients.patientEmail, "Your consultation is booked", "Your Amrutam consultation has been booked.", url, `${event.id}-patient`),
      this.send(recipients.doctorEmail, "A consultation was booked", "A patient booked an Amrutam consultation with you.", url, `${event.id}-doctor`)
    ]);
  }

  private async consultationStatusChanged(event: OutboxJobData): Promise<void> {
    const { consultationId, status } = statusPayload.parse(event.payload);
    const recipients = await this.requireRecipients(consultationId);
    const introduction = `The consultation status changed to ${humanize(status)}.`;
    const url = this.consultationUrl(consultationId);
    await Promise.all([
      this.send(recipients.patientEmail, "Consultation status updated", introduction, url, `${event.id}-patient`),
      this.send(recipients.doctorEmail, "Consultation status updated", introduction, url, `${event.id}-doctor`)
    ]);
  }

  private async paymentStatusChanged(event: OutboxJobData): Promise<void> {
    const { consultationId, status } = statusPayload.parse(event.payload);
    const recipients = await this.requireRecipients(consultationId);
    await this.send(
      recipients.patientEmail,
      "Payment status updated",
      `Your payment status changed to ${humanize(status)}.`,
      this.consultationUrl(consultationId),
      `${event.id}-patient`
    );
  }

  private async prescriptionFinalized(event: OutboxJobData): Promise<void> {
    const { consultationId } = consultationPayload.parse(event.payload);
    const recipients = await this.requireRecipients(consultationId);
    await this.send(
      recipients.patientEmail,
      "Your prescription is ready",
      "Your doctor finalized a prescription for your consultation.",
      this.consultationUrl(consultationId),
      `${event.id}-patient`
    );
  }

  private async requireRecipients(consultationId: string) {
    const recipients = await this.recipients.findConsultationRecipients(consultationId);
    if (!recipients) throw new Error(`Notification recipients not found for consultation ${consultationId}`);
    return recipients;
  }

  private consultationUrl(consultationId: string): URL {
    return new URL(`/consultations/${consultationId}`, this.publicUrl);
  }

  private async send(to: string, subject: string, introduction: string, url: URL, deliveryId: string): Promise<void> {
    await this.email.send({
      to,
      subject,
      text: `${introduction}\n\nView consultation: ${url.toString()}`,
      html: `<p>${escapeHtml(introduction)}</p><p><a href="${escapeHtml(url.toString())}">View consultation</a></p>`,
      eventId: deliveryId
    });
  }
}

function humanize(status: string): string {
  return status.toLowerCase().replaceAll("_", " ");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
