"use client";

import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { FormActionState } from "@/lib/forms/action-state";
import { Alert } from "./feedback";
import { Button, type ButtonVariant } from "./button";
import { Spinner } from "./spinner";
import { Icon, type IconName } from "./icon";

export function SubmitButton({
  idleKey,
  pendingKey = "Common.saving",
  variant = "primary",
  icon,
  className,
}: {
  idleKey: string;
  pendingKey?: string;
  variant?: ButtonVariant;
  icon?: IconName;
  className?: string;
}) {
  const t = useTranslations();
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? <Spinner /> : icon ? <Icon name={icon} size={16} /> : null}
      <span>{t(pending ? pendingKey : idleKey)}</span>
    </Button>
  );
}

export function FormMessage({ state }: { state: FormActionState }) {
  const t = useTranslations();
  if (state.status === "idle") return null;
  if (state.status === "error" && state.errorKey) {
    return (
      <Alert tone="danger" live="alert">
        {t(state.errorKey)}
      </Alert>
    );
  }
  if (state.status === "success" && state.noticeKey) {
    return (
      <Alert tone="success" live="status">
        {t(state.noticeKey)}
      </Alert>
    );
  }
  return null;
}

export function FieldErrors({ messages }: { messages?: string[] }) {
  const t = useTranslations();
  if (!messages || messages.length === 0) return null;
  return (
    <span className="ui-field-error" role="alert">
      {messages.map((message) => (
        <span key={message}>{t(message)}</span>
      ))}
    </span>
  );
}

function describedBy(id: string, hint?: string, errors?: string[]) {
  return [hint ? `${id}-hint` : null, errors?.length ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  /** Renders the label and input in the shared field layout. */
  className?: string;
};

export function Field({
  label,
  name,
  hint,
  errors,
  className,
  id,
  type = "text",
  required,
  ...rest
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const described = describedBy(fieldId, hint, errors);
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")}>
      <label className="ui-label" htmlFor={fieldId}>
        {label}
        {required ? (
          <span className="ui-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        required={required}
        aria-required={required ? true : undefined}
        aria-invalid={errors && errors.length > 0 ? true : undefined}
        aria-describedby={described.length > 0 ? described : undefined}
        className="ui-input"
        {...rest}
      />
      {hint ? (
        <span className="ui-hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
      <span id={`${fieldId}-error`}>
        <FieldErrors messages={errors} />
      </span>
    </div>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  className?: string;
};

export function TextareaField({
  label,
  name,
  hint,
  errors,
  className,
  id,
  required,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const described = describedBy(fieldId, hint, errors);
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")}>
      <label className="ui-label" htmlFor={fieldId}>
        {label}
        {required ? (
          <span className="ui-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <textarea
        id={fieldId}
        name={name}
        required={required}
        aria-required={required ? true : undefined}
        aria-invalid={errors && errors.length > 0 ? true : undefined}
        aria-describedby={described.length > 0 ? described : undefined}
        className="ui-textarea"
        {...rest}
      />
      {hint ? (
        <span className="ui-hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
      <span id={`${fieldId}-error`}>
        <FieldErrors messages={errors} />
      </span>
    </div>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> & {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  errors?: string[];
  className?: string;
};

export function SelectField({
  label,
  name,
  options,
  hint,
  errors,
  className,
  id,
  required,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const described = describedBy(fieldId, hint, errors);
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")}>
      <label className="ui-label" htmlFor={fieldId}>
        {label}
        {required ? (
          <span className="ui-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div className="ui-select-wrap">
        <select
          id={fieldId}
          name={name}
          required={required}
          aria-required={required ? true : undefined}
          aria-invalid={errors && errors.length > 0 ? true : undefined}
          aria-describedby={described.length > 0 ? described : undefined}
          className="ui-select"
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={15} className="ui-select-caret" />
      </div>
      {hint ? (
        <span className="ui-hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
      <span id={`${fieldId}-error`}>
        <FieldErrors messages={errors} />
      </span>
    </div>
  );
}

export function Fieldset({
  legend,
  children,
  hint,
}: {
  legend?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="ui-fieldset">
      {legend ? <legend className="ui-legend">{legend}</legend> : null}
      {hint ? <p className="ui-hint">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/**
 * A form-level validation summary. It is focusable and receives focus when a
 * server validation result arrives, so keyboard and screen-reader users hear
 * the failure before reaching the fields.
 */
export function FormErrorSummary({
  title,
  errors,
  labels,
}: {
  title: string;
  errors: Record<string, string[]> | undefined;
  labels: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations();
  const entries = Object.entries(errors ?? {}).filter(([, messages]) => messages.length > 0);
  const signature = entries.map(([field, messages]) => `${field}:${messages.join(",")}`).join("|");

  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);

  if (entries.length === 0) return null;

  return (
    <div className="ui-error-summary" tabIndex={-1} ref={ref} role="alert">
      <p className="ui-error-summary-title">{title}</p>
      <ul className="ui-error-summary-list">
        {entries.map(([field, messages]) => (
          <li key={field}>
            <a href={`#${field}`}>
              {labels[field] ?? field}: {messages.map((message) => t(message)).join(" ")}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormField({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")}>
      <label className="ui-label">
        {label}
        {required ? (
          <span className="ui-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="ui-hint">{hint}</p> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={["ui-input", props.className].filter(Boolean).join(" ")}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="ui-select-wrap">
      <select
        {...props}
        className={["ui-select", props.className].filter(Boolean).join(" ")}
      >
        {props.children}
      </select>
      <Icon name="chevronDown" size={15} className="ui-select-caret" />
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={["ui-textarea", props.className].filter(Boolean).join(" ")}
    />
  );
}

export function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...props}
      className={["accent-[var(--primary)]", props.className].filter(Boolean).join(" ")}
    />
  );
}
