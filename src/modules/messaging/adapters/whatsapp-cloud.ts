import { MessageAdapter, SendMessageParams, SendMessageResult } from "./interface";

export class WhatsAppCloudAdapter implements MessageAdapter {
  name = "whatsapp_cloud";
  private accessToken?: string;
  private phoneNumberId?: string;
  private apiVersion: string;

  constructor(config?: { accessToken?: string; phoneNumberId?: string; apiVersion?: string }) {
    this.accessToken = config?.accessToken || process.env.WHATSAPP_CLOUD_TOKEN;
    this.phoneNumberId = config?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiVersion = config?.apiVersion || process.env.WHATSAPP_API_VERSION || "v21.0";
  }

  isEnabled(): boolean {
    // Only enabled if credentials are present
    return !!(this.accessToken && this.phoneNumberId);
  }

  async send(params: SendMessageParams): Promise<SendMessageResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: "WhatsApp Cloud API credentials missing - integration disabled",
        permanent: true,
      };
    }

    // This is a production adapter - uses official WhatsApp Cloud API
    // Based on current official documentation
    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: params.to,
          type: "text",
          text: {
            body: params.body,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorCode = error?.error?.code;
        // Check for permanent errors (invalid number, etc.)
        const permanent = errorCode === 131026 || errorCode === 131047 || errorCode === 133000;
        return {
          success: false,
          error: error?.error?.message || `HTTP ${response.status}`,
          permanent,
        };
      }

      const data = await response.json();
      return {
        success: true,
        providerMessageId: data?.messages?.[0]?.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        permanent: false,
      };
    }
  }
}

export const whatsappCloudAdapter = new WhatsAppCloudAdapter();
