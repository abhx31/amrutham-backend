import nodemailer, { type Transporter } from "nodemailer";
import type { Logger } from "pino";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  eventId: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export class FakeEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(private readonly from: string, private readonly logger: Logger) {
    this.transporter = nodemailer.createTransport({
      jsonTransport: true,
      disableFileAccess: true,
      disableUrlAccess: true
    });
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const result = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<${message.eventId}@amrutam.local>`,
      headers: { "X-Amrutam-Event-Id": message.eventId }
    });
    this.logger.info({
      eventId: message.eventId,
      messageId: result.messageId
    }, "Fake email generated");
    return { messageId: result.messageId };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(smtpUrl: string, private readonly from: string) {
    this.transporter = nodemailer.createTransport(smtpUrl, {
      disableFileAccess: true,
      disableUrlAccess: true
    });
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const result = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<${message.eventId}@amrutam.local>`,
      headers: { "X-Amrutam-Event-Id": message.eventId }
    });
    return { messageId: result.messageId };
  }
}
