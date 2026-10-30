export interface FileStorageAdapter {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  signDownload(input: {
    key: string;
    ttlSeconds: number;
    filename: string;
    contentType: string;
  }): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export type MalwareScanResult = { clean: true } | { clean: false };

export interface MalwareScanAdapter {
  scan(body: Buffer): Promise<MalwareScanResult>;
}
