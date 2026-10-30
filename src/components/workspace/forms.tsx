"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createWorkspaceAction, updateWorkspaceAction } from "@/app/actions/workspace";
import {
  Field,
  Fieldset,
  FormErrorSummary,
  FormMessage,
  SelectField,
  SubmitButton,
} from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { initialFormState } from "@/lib/forms/action-state";

const CREATE_FIELDS: Record<string, string> = {
  name: "Workspace.name",
  teachingName: "Workspace.teachingName",
  primarySubject: "Workspace.primarySubject",
  gradesTaught: "Workspace.grades",
};

export function CreateWorkspaceForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(createWorkspaceAction, initialFormState);
  const labels = Object.fromEntries(
    Object.entries(CREATE_FIELDS).map(([field, key]) => [field, t(key)]),
  );

  return (
    <form action={action} className="ui-form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormErrorSummary
        title={t("Common.checkFields")}
        errors={state.fieldErrors}
        labels={labels}
      />
      <Field label={t("Workspace.name")} name="name" required errors={state.fieldErrors?.name} />
      <Field
        label={t("Workspace.teachingName")}
        name="teachingName"
        required
        errors={state.fieldErrors?.teachingName}
      />
      <Field
        label={t("Workspace.primarySubject")}
        name="primarySubject"
        errors={state.fieldErrors?.primarySubject}
      />
      <Field
        label={t("Workspace.grades")}
        name="gradesTaught"
        hint={t("Workspace.gradesHint")}
        errors={state.fieldErrors?.gradesTaught}
      />
      <FormMessage state={state} />
      <div className="ui-form-actions">
        <SubmitButton idleKey="Workspace.createAction" icon="plus" />
      </div>
    </form>
  );
}

export type WorkspaceFormDefaults = {
  name: string;
  teachingName: string;
  primarySubject: string | null;
  gradesTaught: string[];
  atRiskAfter: number;
  inactiveAfter: number;
  locale: string;
  theme: string;
  timezone: string;
  currency: string;
};

const SETTINGS_FIELDS: Record<string, string> = {
  name: "Workspace.name",
  teachingName: "Workspace.teachingName",
  primarySubject: "Workspace.primarySubject",
  gradesTaught: "Workspace.grades",
  atRiskAfter: "Workspace.atRiskAfter",
  inactiveAfter: "Workspace.inactiveAfter",
  locale: "Workspace.workspaceLocale",
  timezone: "Workspace.timezone",
  currency: "Workspace.currency",
  theme: "Common.theme",
};

export function WorkspaceSettingsForm({
  locale,
  defaults,
  canWrite,
}: {
  locale: string;
  defaults: WorkspaceFormDefaults;
  canWrite: boolean;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(updateWorkspaceAction, initialFormState);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    defaults.theme === "light" || defaults.theme === "dark" ? defaults.theme : "system",
  );
  const [workspaceLocale, setWorkspaceLocale] = useState<"ar" | "en">(
    defaults.locale === "en" ? "en" : "ar",
  );
  const labels = Object.fromEntries(
    Object.entries(SETTINGS_FIELDS).map(([field, key]) => [field, t(key)]),
  );

  return (
    <form action={action} className="ui-form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {!canWrite ? (
        <Alert tone="warning" icon="lock">
          {t("Workspace.readOnly")}
        </Alert>
      ) : null}

      <FormErrorSummary
        title={t("Common.checkFields")}
        errors={state.fieldErrors}
        labels={labels}
      />

      <Fieldset legend={t("Workspace.profileSection")}>
        <Field
          label={t("Workspace.name")}
          name="name"
          defaultValue={defaults.name}
          required
          disabled={!canWrite}
          errors={state.fieldErrors?.name}
        />
        <Field
          label={t("Workspace.teachingName")}
          name="teachingName"
          defaultValue={defaults.teachingName}
          required
          disabled={!canWrite}
          errors={state.fieldErrors?.teachingName}
        />
        <Field
          label={t("Workspace.primarySubject")}
          name="primarySubject"
          defaultValue={defaults.primarySubject ?? ""}
          disabled={!canWrite}
          errors={state.fieldErrors?.primarySubject}
        />
        <Field
          label={t("Workspace.grades")}
          name="gradesTaught"
          defaultValue={defaults.gradesTaught.join(", ")}
          hint={t("Workspace.gradesHint")}
          disabled={!canWrite}
          errors={state.fieldErrors?.gradesTaught}
        />
      </Fieldset>

      <Fieldset legend={t("Workspace.thresholdsSection")} hint={t("Workspace.thresholdsHint")}>
        <SelectField
          label={t("Workspace.workspaceLocale")}
          name="workspaceLocale"
          value={workspaceLocale}
          onChange={(event) => {
            if (event.target.value === "ar" || event.target.value === "en") {
              setWorkspaceLocale(event.target.value);
            }
          }}
          hint={t("Workspace.workspaceLocaleHint")}
          disabled={!canWrite}
          errors={state.fieldErrors?.locale}
          options={[
            { value: "ar", label: t("Common.arabic") },
            { value: "en", label: t("Common.english") },
          ]}
        />
        <div className="ui-form-row">
          <Field
            label={t("Workspace.atRiskAfter")}
            name="atRiskAfter"
            type="number"
            min={1}
            max={9}
            defaultValue={String(defaults.atRiskAfter)}
            required
            disabled={!canWrite}
            errors={state.fieldErrors?.atRiskAfter}
          />
          <Field
            label={t("Workspace.inactiveAfter")}
            name="inactiveAfter"
            type="number"
            min={2}
            max={10}
            defaultValue={String(defaults.inactiveAfter)}
            required
            disabled={!canWrite}
            errors={state.fieldErrors?.inactiveAfter}
          />
        </div>
        <div className="ui-form-row">
          <Field
            label={t("Workspace.timezone")}
            name="timezone"
            defaultValue={defaults.timezone}
            dir="ltr"
            required
            disabled={!canWrite}
            errors={state.fieldErrors?.timezone}
          />
          <Field
            label={t("Workspace.currency")}
            name="currency"
            defaultValue={defaults.currency}
            dir="ltr"
            hint={t("Workspace.currencyHint")}
            required
            readOnly
            disabled={!canWrite}
            errors={state.fieldErrors?.currency}
          />
        </div>
        <SelectField
          label={t("Workspace.workspaceTheme")}
          name="theme"
          value={theme}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "light" || next === "dark" || next === "system") setTheme(next);
          }}
          hint={t("Workspace.workspaceThemeHint")}
          disabled={!canWrite}
          errors={state.fieldErrors?.theme}
          options={[
            { value: "system", label: t("Common.themeSystem") },
            { value: "light", label: t("Common.themeLight") },
            { value: "dark", label: t("Common.themeDark") },
          ]}
        />
      </Fieldset>

      <FormMessage state={state} />

      {canWrite ? (
        <div className="ui-form-actions ui-action-bar" data-sticky="true">
          <SubmitButton idleKey="Common.save" pendingKey="Common.saving" icon="save" />
        </div>
      ) : null}
    </form>
  );
}
