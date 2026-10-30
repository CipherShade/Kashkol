export type FormActionState = {
  status: "idle" | "error" | "success";
  /** A message-catalogue key, never a raw server message. */
  errorKey?: string;
  noticeKey?: string;
  fieldErrors?: Record<string, string[]>;
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
