import { MessageAdapter, SendMessageParams, SendMessageResult } from "./interface";
import { getServerEnv } from "@/lib/config/env";
import nodemailer from "nodemailer";

export class SmtpMessageAdapter implements MessageAdapter {
  name = "smtp";

  isEnabled(): boolean {
    const env = getServerEnv();
    return env.EMAIL_TRANSPORT === "smtp";
  }

  async send(params: SendMessageParams): Promise<SendMessageResult> {
    const env = getServerEnv();
    try {
      if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
        return { success: false, error: "SMTP credentials missing", permanent: false };
      }
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        tls: { rejectUnauthorized: env.APP_ENV === "production" },
      });
      const info = await transporter.sendMail({
        from: env.EMAIL_FROM || "Kashkol <no-reply@kashkol.local>",
        to: params.to,
        subject: params.templateKey ? `${params.templateKey}` : "Notification",
        text: params.body,
        html: `<p>${params.body.replace(/\n/g, "<br>")}</p>`,
      });
      return { success: true, providerMessageId: info.messageId ?? undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Never log credentials; sanitize message by stripping known credential patterns
      const safe = msg.replace(/[^\s]*@[^\s]*\.[^\s]*/g, "[redacted]").replace(/pass[^\s]*/gi, "[redacted]");
      return { success: false, error: safe, permanent: false };
    }
  }
}

export const smtpAdapter = new SmtpMessageAdapter();
