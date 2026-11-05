import { MessageAdapter } from "./interface";
import { fakeAdapter } from "./fake";
import { whatsappCloudAdapter } from "./whatsapp-cloud";
import { smtpAdapter } from "./smtp";

let currentAdapter: MessageAdapter = fakeAdapter;

/**
 * Select the transport for one outbox message.
 *
 * The choice follows the message channel, not the presence of an unrelated
 * integration: an email message must never be handed to the WhatsApp adapter,
 * and a WhatsApp message must never be handed to SMTP (which would send a
 * phone number to an email provider). An email message with no SMTP
 * configuration reaches the SMTP adapter, which fails permanently instead of
 * pretending the message was sent.
 */
export function getMessageAdapter(channel?: string): MessageAdapter {
  if (channel === "email") {
    return smtpAdapter;
  }

  if (channel === "whatsapp" || channel === "sms") {
    if (process.env.MESSAGING_PROVIDER === "whatsapp_cloud" && whatsappCloudAdapter.isEnabled()) {
      return whatsappCloudAdapter;
    }
    return currentAdapter;
  }

  // Callers that do not name a channel keep the historical selection order.
  if (process.env.MESSAGING_PROVIDER === "smtp" && smtpAdapter.isEnabled()) {
    return smtpAdapter;
  }
  if (process.env.MESSAGING_PROVIDER === "whatsapp_cloud" && whatsappCloudAdapter.isEnabled()) {
    return whatsappCloudAdapter;
  }
  return currentAdapter;
}

export function setMessageAdapter(adapter: MessageAdapter) {
  currentAdapter = adapter;
}

export type { MessageAdapter, SendMessageParams, SendMessageResult } from "./interface";
export { FakeMessageAdapter } from "./fake";
export { WhatsAppCloudAdapter } from "./whatsapp-cloud";
export { SmtpMessageAdapter } from "./smtp";
