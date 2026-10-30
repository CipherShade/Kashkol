import { AppError } from "@/lib/http/errors";
import { MAX_FILE_SIZE_BYTES } from "./constants";

const TYPES = {
  pdf: { mime: "application/pdf", magic: Buffer.from("%PDF-") },
  png: { mime: "image/png", magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", magic: Buffer.from([0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", magic: Buffer.from([0xff, 0xd8, 0xff]) },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rootEntry: "word/document.xml",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    rootEntry: "xl/workbook.xml",
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rootEntry: "ppt/presentation.xml",
  },
} as const;

export type AcceptedExtension = keyof typeof TYPES;

function reject(messageKey: string): never {
  throw new AppError("VALIDATION_FAILED", { messageKey });
}

function zipEntries(body: Buffer): Array<{ name: string; compressedSize: number; size: number }> {
  const searchStart = Math.max(0, body.length - 65_557);
  const endOffset = body.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (
    endOffset < searchStart ||
    endOffset + 22 > body.length ||
    body.readUInt16LE(endOffset + 4) !== 0 ||
    body.readUInt16LE(endOffset + 6) !== 0
  ) {
    reject("errors.fileTypeNotAllowed");
  }

  const entries = body.readUInt16LE(endOffset + 10);
  const centralSize = body.readUInt32LE(endOffset + 12);
  const centralOffset = body.readUInt32LE(endOffset + 16);
  const commentLength = body.readUInt16LE(endOffset + 20);
  if (
    entries === 0 ||
    entries > 10_000 ||
    centralOffset + centralSize > endOffset ||
    endOffset + 22 + commentLength !== body.length
  ) {
    reject("errors.fileTypeNotAllowed");
  }

  const result: Array<{ name: string; compressedSize: number; size: number }> = [];
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > body.length || body.readUInt32LE(offset) !== 0x02014b50) {
      reject("errors.fileTypeNotAllowed");
    }
    const flags = body.readUInt16LE(offset + 8);
    const compressedSize = body.readUInt32LE(offset + 20);
    const size = body.readUInt32LE(offset + 24);
    const nameLength = body.readUInt16LE(offset + 28);
    const extraLength = body.readUInt16LE(offset + 30);
    const entryCommentLength = body.readUInt16LE(offset + 32);
    const nameEnd = offset + 46 + nameLength;
    const nextOffset = nameEnd + extraLength + entryCommentLength;
    if (nextOffset > body.length || flags & 0x0001) reject("errors.fileTypeNotAllowed");

    const name = body.subarray(offset + 46, nameEnd).toString("utf8");
    if (
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.startsWith("/") ||
      /^[a-z]:/i.test(name) ||
      name.split("/").includes("..") ||
      /\.(exe|dll|so|com|bat|cmd|ps1|sh|msi|scr|js|mjs|vbs|hta|jar|class)$/i.test(name) ||
      /(^|\/)vbaProject\.bin$/i.test(name) ||
      size > 100 * 1024 * 1024 ||
      (size > 0 && (compressedSize === 0 || size / compressedSize > 100))
    ) {
      reject("errors.fileTypeNotAllowed");
    }
    result.push({ name, compressedSize, size });
    totalCompressed += compressedSize;
    totalUncompressed += size;
    if (
      totalUncompressed > 100 * 1024 * 1024 ||
      (totalUncompressed > 0 &&
        (totalCompressed === 0 || totalUncompressed / totalCompressed > 100))
    ) {
      reject("errors.fileTypeNotAllowed");
    }
    offset = nextOffset;
  }

  if (offset !== centralOffset + centralSize) reject("errors.fileTypeNotAllowed");
  return result;
}

export function validateFileContent(input: {
  filename: string;
  mime: string;
  sizeBytes: number;
  body: Buffer;
}): { extension: AcceptedExtension; mime: string } {
  if (
    input.sizeBytes < 1 ||
    input.sizeBytes > MAX_FILE_SIZE_BYTES ||
    input.body.byteLength !== input.sizeBytes
  ) {
    reject("errors.fileSizeInvalid");
  }

  const extension = input.filename.split(".").pop()?.toLowerCase() as AcceptedExtension | undefined;
  if (!extension || !(extension in TYPES)) reject("errors.fileTypeNotAllowed");
  const type = TYPES[extension];
  if (input.mime.toLowerCase() !== type.mime) reject("errors.fileTypeNotAllowed");

  if ("magic" in type) {
    if (!input.body.subarray(0, type.magic.length).equals(type.magic)) {
      reject("errors.fileTypeNotAllowed");
    }
  } else {
    if (
      input.body.length < 4 ||
      input.body.readUInt32LE(0) !== 0x04034b50 ||
      !zipEntries(input.body).some(({ name }) => name === type.rootEntry)
    ) {
      reject("errors.fileTypeNotAllowed");
    }
  }

  return { extension, mime: type.mime };
}

export function safeDownloadFilename(title: string, extension: string): string {
  const titleWithoutExtension = title.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
    ? title.slice(0, -(extension.length + 1))
    : title;
  const safeTitle =
    Array.from(titleWithoutExtension.normalize("NFC"))
      .map((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return `\\/:*?"<>|`.includes(character) || codePoint <= 0x1f || codePoint === 0x7f
          ? " "
          : character;
      })
      .join("")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 120) || "material";
  return `${safeTitle}.${extension}`;
}

export function attachmentContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
