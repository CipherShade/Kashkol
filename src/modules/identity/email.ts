import type { ServerEnv } from "@/lib/config/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailTransport = {
  /** True when this transport can actually deliver a message. */
  readonly configured: boolean;
  send(message: EmailMessage): Promise<void>;
};

/**
 * The local-only transport. It writes the message (including the single-use
 * link) to the **server console**. It never writes to an HTTP response and the
 * configuration parser refuses to accept it outside `APP_ENV=local`.
 */
export function createConsoleEmailTransport(sender: string): EmailTransport {
  return {
    configured: true,
    async send(message) {
      console.warn(
        [
          "[email:local] outbound email was not sent over a network.",
          `[email:local] from=${sender}`,
          `[email:local] to=${message.to}`,
          `[email:local] subject=${message.subject}`,
          message.text,
          "[email:local] this transport exists only for local development.",
        ].join("\n"),
      );
    },
  };
}

/**
 * The safe no-op used when no provider is configured. Verification and
 * recovery are disabled rather than pretending to send: the UI states the
 * limitation and no token is ever placed in a response or a log.
 */
export function createDisabledEmailTransport(): EmailTransport {
  return {
    configured: false,
    async send() {
      // Deliberately does nothing and logs nothing.
    },
  };
}

export function createEmailTransport(env: ServerEnv): EmailTransport {
  if (env.EMAIL_TRANSPORT === "console") {
    return createConsoleEmailTransport(env.EMAIL_FROM);
  }
  return createDisabledEmailTransport();
}

let transport: EmailTransport | undefined;

export function getEmailTransport(env: ServerEnv): EmailTransport {
  transport ??= createEmailTransport(env);
  return transport;
}

export function resetEmailTransportForTests(): void {
  transport = undefined;
}

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "Kashkol — verify your email / تأكيد البريد الإلكتروني",
    text: [
      "Verify your Kashkol email address by opening this single-use link:",
      url,
      "",
      "The link expires in 24 hours. If you did not create an account, ignore this message.",
      "",
      "لتأكيد بريدك الإلكتروني في كشكول، افتح الرابط التالي:",
      url,
      "",
      "ينتهي صلاحية الرابط بعد ٢٤ ساعة. إذا لم تنشئ حسابًا، تجاهل هذه الرسالة.",
    ].join("\n"),
  };
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "Kashkol — reset your password / إعادة تعيين كلمة المرور",
    text: [
      "Reset your Kashkol password by opening this single-use link:",
      url,
      "",
      "The link expires in 30 minutes and stops working after it is used.",
      "",
      "لإعادة تعيين كلمة المرور في كشكول، افتح الرابط التالي:",
      url,
      "",
      "ينتهي صلاحية الرابط بعد ٣٠ دقيقة ويتوقف عن العمل بعد استخدامه.",
    ].join("\n"),
  };
}

/**
 * The assistant invitation message. `url` contains the only copy of the
 * token; it is never returned in an HTTP response or written to a log.
 */
export function workspaceInvitationEmail(
  to: string,
  url: string,
  workspaceName: string,
  inviterName: string,
): EmailMessage {
  return {
    to,
    subject: `Kashkol — join ${workspaceName} / دعوة للانضمام إلى ${workspaceName}`,
    text: [
      `${inviterName} invited you to join the workspace "${workspaceName}" as an assistant.`,
      "Open this single-use link to accept:",
      url,
      "",
      "The link expires in 7 days. If you were not expecting this invitation, ignore this message.",
      "",
      `${inviterName} دعاك للانضمام إلى مساحة العمل "${workspaceName}" كمساعد.`,
      "افتح الرابط التالي لقبول الدعوة:",
      url,
      "",
      "ينتهي صلاحية الرابط بعد ٧ أيام. إذا لم تكن تتوقع هذه الدعوة، تجاهل هذه الرسالة.",
    ].join("\n"),
  };
}
