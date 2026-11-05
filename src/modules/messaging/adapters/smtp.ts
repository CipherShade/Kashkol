import { MessageAdapter, SendMessageParams, SendMessageResult } from "./interface";
import { getServerEnv } from "@/lib/config/env";
import nodemailer from "nodemailer";

export class SmtpMessageAdapter implements MessageAdapter {
  name = "smtp";

  isEnabled(): boolean {
    const env = getServerEnv();
    return (
      env.EMAIL_TRANSPORT === "smtp" &&
      Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
    );
  }

  async send(params: SendMessageParams): Promise<SendMessageResult> {
    const env = getServerEnv();
    if (env.EMAIL_TRANSPORT !== "smtp") {
      return { success: false, error: "SMTP transport is not configured", permanent: true };
    }
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      return { success: false, error: "SMTP credentials missing", permanent: true };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        tls: { rejectUnauthorized: env.APP_ENV === "production" },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      const info = await transporter.sendMail({
        from: env.EMAIL_FROM || "Kashkol <no-reply@kashkol.local>",
        to: params.to,
        subject: params.templateKey ? `${params.templateKey}` : "Notification",
        // Plain text only: message bodies carry names and must not be rendered as HTML.
        text: params.body,
      });
      return { success: true, providerMessageId: info.messageId ?? undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Never log credentials: remove the configured values first, then any
      // address-like token, before the text can reach a log or the UI.
      let safe = msg;
      for (const secret of [env.SMTP_PASS, env.SMTP_USER]) {
        if (secret) safe = safe.split(secret).join("[redacted]");
      }
      safe = safe.replace(/[^\s]*@[^\s]*\.[^\s]*/g, "[redacted]").replace(/pass[^\s]*/gi, "[redacted]");
      return { success: false, error: safe, permanent: false };
    }
  }
}

export const smtpAdapter = new SmtpMessageAdapter();
