export interface MessageAdapter {
  name: string;
  send(params: SendMessageParams): Promise<SendMessageResult>;
  isEnabled(): boolean;
}

export interface SendMessageParams {
  to: string; // E.164
  body: string;
  templateKey?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  permanent?: boolean; // true if should not retry
}
