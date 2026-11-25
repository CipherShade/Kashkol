const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE_KEY_PATTERN = new RegExp(
  `^ws/${UUID}/(?:` +
    `${UUID}\\.(?:pdf|png|jpg|jpeg|docx|xlsx|pptx)|` +
    `reports/${UUID}\\.(?:csv|xlsx|pdf)|` +
    `backups/${UUID}\\.json|` +
    `restore-staging/${UUID}\\.json` +
    `)$`,
  "i",
);

export function assertSafeStorageKey(key: string): void {
  if (!FILE_KEY_PATTERN.test(key)) {
    throw new Error("Invalid generated file storage key");
  }
}
