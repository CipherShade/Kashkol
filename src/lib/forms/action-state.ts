export type FormActionState = {
  status: "idle" | "error" | "success";
  /** A message-catalogue key, never a raw server message. */
  errorKey?: string;
  noticeKey?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * A one-time secret handed to the actor exactly once: a teacher-generated
   * portal password. It is never persisted in the client, never re-served,
   * and never logged. Absent on every other action.
   */
  oneTimeCredential?: { username: string; password: string };
};

export const initialFormState: FormActionState = { status: "idle" };

export function errorState(
  errorKey: string,
  fieldErrors?: Record<string, string[]>,
): FormActionState {
  return { status: "error", errorKey, ...(fieldErrors ? { fieldErrors } : {}) };
}

export function noticeState(noticeKey: string): FormActionState {
  return { status: "success", noticeKey };
}
