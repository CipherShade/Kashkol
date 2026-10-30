import { describe, expect, it } from "vitest";
import { REQUEST_ID_HEADER, newRequestId, requestIdFromHeaders } from "@/lib/http/request-id";

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("request ids", () => {
  it("produces a 26-character Crockford base32 ULID", () => {
    const id = newRequestId(1_700_000_000_000, new Uint8Array(10));
    expect(id).toMatch(ULID_PATTERN);
    expect(id).toHaveLength(26);
  });

  it("sorts lexicographically by timestamp", () => {
    const earlier = newRequestId(1_700_000_000_000, new Uint8Array(10));
    const later = newRequestId(1_700_000_000_001, new Uint8Array(10));
    expect(earlier < later).toBe(true);
  });

  it("rejects a short random source", () => {
    expect(() => newRequestId(1, new Uint8Array(9))).toThrow(RangeError);
  });

  it("rejects a time outside the 48-bit range", () => {
    expect(() => newRequestId(-1)).toThrow(RangeError);
    expect(() => newRequestId(0x1_0000_0000_0000)).toThrow(RangeError);
  });

  it("keeps a valid incoming request id", () => {
    const existing = newRequestId(1_700_000_000_000, new Uint8Array(10));
    const headers = new Headers({ [REQUEST_ID_HEADER]: existing });
    expect(requestIdFromHeaders(headers)).toBe(existing);
  });

  it("replaces an invalid incoming request id", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "not-a-ulid" });
    const generated = requestIdFromHeaders(headers);
    expect(generated).not.toBe("not-a-ulid");
    expect(generated).toMatch(ULID_PATTERN);
  });
});
