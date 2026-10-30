const FILE_KEY_PATTERN =
  /^ws\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg|docx|xlsx|pptx)|reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv)$/i;

export function assertSafeStorageKey(key: string): void {
  if (!FILE_KEY_PATTERN.test(key)) {
    throw new Error("Invalid generated file storage key");
  }
}
