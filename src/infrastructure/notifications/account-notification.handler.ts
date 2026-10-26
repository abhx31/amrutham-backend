import { z } from "zod";
import type { DomainEventHandler, OutboxJobData } from "../outbox/outbox.types.js";
import type { EmailProvider } from "./email.provider.js";
import type { NotificationRecipientRepository } from "./notification.repository.js";

const payloadSchema = z.object({
  tokenId: z.string().uuid(),
  encryptedToken: z.string().min(1)
});

export interface TokenDecryptor {
  decrypt(encrypted: string): string;
}

export class AccountNotificationHandler implements DomainEventHandler {
  constructor(
    private readonly recipients: NotificationRecipientRepository,
    private readonly email: EmailProvider,
    private readonly tokenDecryptor: TokenDecryptor,
    private readonly publicUrl: string
  ) {}

  async handle(event: OutboxJobData): Promise<void> {
    const template = templates[event.eventType];
    if (!template) throw new Error(`Unsupported account notification event: ${event.eventType}`);
    const recipient = await this.recipients.findEmail(event.aggregateId);
    if (!recipient) throw new Error(`Notification recipient not found for user ${event.aggregateId}`);
    const payload = payloadSchema.parse(event.payload);
    const token = this.tokenDecryptor.decrypt(payload.encryptedToken);
    const url = new URL(template.path, this.publicUrl);
    url.searchParams.set("token", token);

    await this.email.send({
      to: recipient,
      subject: template.subject,
      text: `${template.introduction}\n\n${url.toString()}\n\nIf you did not request this, ignore this email.`,
      html: `<p>${template.introduction}</p><p><a href="${escapeHtml(url.toString())}">${template.action}</a></p><p>If you did not request this, ignore this email.</p>`,
      eventId: event.id
    });
  }
}

const templates: Record<string, { subject: string; introduction: string; action: string; path: string }> = {
  "account.password_reset_requested": {
    subject: "Reset your Amrutam password",
    introduction: "A password reset was requested for your Amrutam account.",
    action: "Reset password",
    path: "/reset-password"
  },
  "account.email_verification_requested": {
    subject: "Verify your Amrutam email",
    introduction: "Please verify the email address for your Amrutam account.",
    action: "Verify email",
    path: "/verify-email"
  }
};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
