import { MessageAdapter, SendMessageParams, SendMessageResult } from "./interface";

export class FakeMessageAdapter implements MessageAdapter {
  name = "fake";
  private sent: SendMessageParams[] = [];

  isEnabled(): boolean {
    return true;
  }

  async send(params: SendMessageParams): Promise<SendMessageResult> {
    // Never send external messages - just log for testing
    this.sent.push(params);
    return {
      success: true,
      providerMessageId: `fake_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };
  }

  getSent(): SendMessageParams[] {
    return this.sent;
  }

  clear(): void {
    this.sent = [];
  }
}

export const fakeAdapter = new FakeMessageAdapter();
