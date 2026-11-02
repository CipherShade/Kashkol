import { MessageAdapter } from "./interface";
import { fakeAdapter } from "./fake";
import { whatsappCloudAdapter } from "./whatsapp-cloud";
import { smtpAdapter } from "./smtp";

let currentAdapter: MessageAdapter = fakeAdapter;

export function getMessageAdapter(): MessageAdapter {
  // Check settings/env - if WhatsApp Cloud is configured and enabled, use it
  if (whatsappCloudAdapter.isEnabled()) {
    // In production, would check workspace settings
    // For now, default to fake unless explicitly forced
    const provider = process.env.MESSAGING_PROVIDER;
    if (provider === "whatsapp_cloud") {
      return whatsappCloudAdapter;
    }
    if (provider === "smtp" || process.env.EMAIL_TRANSPORT === "smtp") {
      return smtpAdapter;
    }
  }
  return currentAdapter;
}

export function setMessageAdapter(adapter: MessageAdapter) {
  currentAdapter = adapter;
}

export type { MessageAdapter, SendMessageParams, SendMessageResult } from "./interface";
export { FakeMessageAdapter } from "./fake";
export { WhatsAppCloudAdapter } from "./whatsapp-cloud";
