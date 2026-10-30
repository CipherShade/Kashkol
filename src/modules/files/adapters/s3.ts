import "server-only";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "@/lib/config/env";
import { assertSafeStorageKey } from "./key";
import type { FileStorageAdapter } from "./interface";
import { attachmentContentDisposition } from "../validation";

let cachedClient: S3Client | undefined;

function clientConfig() {
  const env = getServerEnv();
  if (!env.S3_BUCKET || !env.S3_REGION) {
    throw new Error("S3-compatible file storage is not configured");
  }
  cachedClient ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    maxAttempts: 3,
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  return { env, client: cachedClient };
}

export class S3FileStorageAdapter implements FileStorageAdapter {
  async put(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    assertSafeStorageKey(input.key);
    const { env, client } = clientConfig();
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        Body: input.body,
        ContentLength: input.body.byteLength,
        ContentType: input.contentType,
        ServerSideEncryption: "AES256",
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  }

  async get(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    const { env, client } = clientConfig();
    const response = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
    if (!response.Body) throw new Error("Stored file is missing");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async signDownload(input: {
    key: string;
    ttlSeconds: number;
    filename: string;
    contentType: string;
  }): Promise<string> {
    assertSafeStorageKey(input.key);
    const { env, client } = clientConfig();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        ResponseContentDisposition: attachmentContentDisposition(input.filename),
        ResponseContentType: input.contentType,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: input.ttlSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    const { env, client } = clientConfig();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    const { env, client } = clientConfig();
    try {
      await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
      return true;
    } catch (error) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
        return false;
      }
      throw error;
    }
  }
}
