"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { readErrorMessageKey, useApiErrorMessage } from "@/modules/forms/client-api";
import { formDefinitionSchema, parseFormInput } from "@/modules/forms/schemas";

import {
  ACTIONS,
  CHOICE_TYPES,
  OPERATORS,
  QUESTION_TYPES,
  asAction,
  asBoolean,
  asNumber,
  asOperator,
  asOptionalNumber,
  asQuestionType,
  asString,
  defaultConfig,
  defaultOptionCount,
  emptyQuestion,
  newKey,
  toDefinitionPayload,
  toFormState,
  validateFormState,
  type ApiFormDetail,
  type FormDefinitionState,
  type LogicAction,
  type LogicInput,
  type LogicOperator,
  type OptionInput,
  type QuestionInput,
  type QuestionType,
  type SectionInput,
} from "@/modules/forms/editor-state";

export const dynamic = "force-dynamic";

const PUBLIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export default function FormEditorPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = use(params);
  const t = useTranslations("forms");
  const apiErrorMessage = useApiErrorMessage();
  const pushToast = useToast();
  const locale = useLocale();
  const router = useRouter();
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [formState, setFormState] = useState<FormDefinitionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [baseline, setBaseline] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/forms/${formId}`);
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as ApiFormDetail;
        if (cancelled) return;
        const mapped = toFormState(data, {
          sectionDefaultTitle: t("editor.sectionDefaultTitle"),
        });
        setFormState(mapped);
        setBaseline(JSON.stringify(toDefinitionPayload(mapped)));
        setErrorMsg(null);
      } catch {
        if (cancelled) return;
        setErrorMsg(t("editor.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId, reloadToken, t]);

  const retry = () => {
    setLoading(true);
    setErrorMsg(null);
    setReloadToken((token) => token + 1);
  };

  const mutate = (updater: (current: FormDefinitionState) => FormDefinitionState) => {
    setFormState((current) => (current ? updater(current) : current));
  };

  const readOnly =
    !formState || formState.status !== "draft" || formState.submissionCount > 0;

  const isDirty = useMemo(() => {
    if (!formState || baseline === null) return false;
    return JSON.stringify(toDefinitionPayload(formState)) !== baseline;
  }, [formState, baseline]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const updateQuestion = (index: number, patch: Partial<QuestionInput>) => {
    mutate((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    }));
  };

  const addQuestion = (type: QuestionType = "short_answer") => {
    mutate((current) => ({
      ...current,
      questions: [
        ...current.questions,
        emptyQuestion(
          type,
          current.sections.length > 0 ? 0 : null,
          t("editor.defaultQuestionPrompt"),
          t("editor.defaultOption"),
        ),
      ],
    }));
  };

  const changeQuestionType = (index: number, type: QuestionType) => {
    mutate((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => {
        if (questionIndex !== index) return question;
        const keepOptions =
          CHOICE_TYPES.has(question.questionType) && CHOICE_TYPES.has(type);
        const baseOptions = keepOptions ? question.options : [];
        const optionCount = CHOICE_TYPES.has(type)
          ? Math.max(defaultOptionCount(type), baseOptions.length)
          : 0;
        return {
          ...question,
          questionType: type,
          config: defaultConfig(type),
          options: Array.from({ length: optionCount }, (_, optionIndex) =>
            baseOptions[optionIndex] ?? {
              label: `${t("editor.defaultOption")} ${optionIndex + 1}`,
            },
          ),
        };
      }),
    }));
  };

  const duplicateQuestion = (index: number) => {
    mutate((current) => {
      const source = current.questions[index];
      if (!source) return current;
      const copy: QuestionInput = {
        ...source,
        key: newKey(),
        config: { ...source.config },
        options: source.options.map((option) => ({ ...option })),
      };
      const questions = [...current.questions];
      questions.splice(index + 1, 0, copy);
      const logic = current.logic.map((rule) => ({
        ...rule,
        sourceQuestionIndex:
          rule.sourceQuestionIndex > index
            ? rule.sourceQuestionIndex + 1
            : rule.sourceQuestionIndex,
        targetQuestionIndex:
          rule.targetQuestionIndex !== null && rule.targetQuestionIndex > index
            ? rule.targetQuestionIndex + 1
            : rule.targetQuestionIndex,
      }));
      return { ...current, questions, logic };
    });
  };

  const deleteQuestion = (index: number) => {
    mutate((current) => ({
      ...current,
      questions: current.questions.filter((_, questionIndex) => questionIndex !== index),
      logic: current.logic
        .filter(
          (rule) =>
            rule.sourceQuestionIndex !== index && rule.targetQuestionIndex !== index,
        )
        .map((rule) => ({
          ...rule,
          sourceQuestionIndex:
            rule.sourceQuestionIndex > index
              ? rule.sourceQuestionIndex - 1
              : rule.sourceQuestionIndex,
          targetQuestionIndex:
            rule.targetQuestionIndex !== null && rule.targetQuestionIndex > index
              ? rule.targetQuestionIndex - 1
              : rule.targetQuestionIndex,
        })),
    }));
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    mutate((current) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.questions.length) return current;
      const questions = [...current.questions];
      const [moved] = questions.splice(index, 1);
      questions.splice(targetIndex, 0, moved);
      const remap = (questionIndex: number): number => {
        if (questionIndex === index) return targetIndex;
        if (questionIndex === targetIndex) return index;
        return questionIndex;
      };
      const logic = current.logic.map((rule) => ({
        ...rule,
        sourceQuestionIndex: remap(rule.sourceQuestionIndex),
        targetQuestionIndex:
          rule.targetQuestionIndex === null
            ? null
            : remap(rule.targetQuestionIndex),
      }));
      return { ...current, questions, logic };
    });
  };

  const updateSection = (index: number, patch: Partial<SectionInput>) => {
    mutate((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    }));
  };

  const addSection = () => {
    mutate((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          key: newKey(),
          title: `${t("editor.sectionDefaultTitle")} ${current.sections.length + 1}`,
          description: "",
          pageBreakBefore: true,
        },
      ],
    }));
  };

  const sectionIsUsed = (sectionIndex: number): boolean =>
    Boolean(
      formState?.questions.some((question) => question.sectionIndex === sectionIndex) ||
        formState?.logic.some((rule) => rule.targetSectionIndex === sectionIndex),
    );

  const deleteSection = (index: number) => {
    mutate((current) => {
      if (current.sections.length <= 1) return current;
      if (
        current.questions.some((question) => question.sectionIndex === index) ||
        current.logic.some((rule) => rule.targetSectionIndex === index)
      ) {
        return current;
      }
      const sections = current.sections.filter(
        (_, sectionIndex) => sectionIndex !== index,
      );
      const remap = (sectionIndex: number): number =>
        sectionIndex > index ? sectionIndex - 1 : sectionIndex;
      return {
        ...current,
        sections,
        questions: current.questions.map((question) => ({
          ...question,
          sectionIndex:
            question.sectionIndex === null
              ? null
              : remap(question.sectionIndex),
        })),
        logic: current.logic.map((rule) => ({
          ...rule,
          targetSectionIndex:
            rule.targetSectionIndex === null
              ? null
              : remap(rule.targetSectionIndex),
        })),
      };
    });
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    mutate((current) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.sections.length) return current;
      const order = current.sections.map((_, sectionIndex) => sectionIndex);
      [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
      const sections = order.map((oldIndex) => current.sections[oldIndex]);
      const remap = new Map<number, number>();
      order.forEach((oldIndex, newIndex) => remap.set(oldIndex, newIndex));
      return {
        ...current,
        sections,
        questions: current.questions.map((question) => ({
          ...question,
          sectionIndex:
            question.sectionIndex === null
              ? null
              : (remap.get(question.sectionIndex) ?? question.sectionIndex),
        })),
        logic: current.logic.map((rule) => ({
          ...rule,
          targetSectionIndex:
            rule.targetSectionIndex === null
              ? null
              : (remap.get(rule.targetSectionIndex) ?? rule.targetSectionIndex),
        })),
      };
    });
  };

  const updateRule = (index: number, patch: Partial<LogicInput>) => {
    mutate((current) => ({
      ...current,
      logic: current.logic.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    }));
  };

  const addLogicRule = () => {
    mutate((current) => {
      if (current.questions.length < 2) return current;
      return {
        ...current,
        logic: [
          ...current.logic,
          {
            key: newKey(),
            sourceQuestionIndex: 0,
            operator: "is_answered",
            comparison: {},
            action: "show",
            targetQuestionIndex: 1,
            targetSectionIndex: null,
          },
        ],
      };
    });
  };

  const removeRule = (index: number) => {
    mutate((current) => ({
      ...current,
      logic: current.logic.filter((_, ruleIndex) => ruleIndex !== index),
    }));
  };

  const changeOperator = (index: number, operator: LogicOperator) => {
    mutate((current) => ({
      ...current,
      logic: current.logic.map((rule, ruleIndex) => {
        if (ruleIndex !== index) return rule;
        if (operator === "is_answered" || operator === "is_not_answered") {
          return { ...rule, operator, comparison: {} };
        }
        const source = current.questions[rule.sourceQuestionIndex];
        const comparison =
          source && CHOICE_TYPES.has(source.questionType)
            ? { optionIndex: 0 }
            : {};
        return { ...rule, operator, comparison };
      }),
    }));
  };

  const changeAction = (index: number, action: LogicAction) => {
    mutate((current) => ({
      ...current,
      logic: current.logic.map((rule, ruleIndex) => {
        if (ruleIndex !== index) return rule;
        if (action !== "require") return { ...rule, action };
        const fallbackTarget = current.questions.findIndex(
          (_, questionIndex) => questionIndex !== rule.sourceQuestionIndex,
        );
        return {
          ...rule,
          action,
          targetSectionIndex: null,
          targetQuestionIndex:
            rule.targetQuestionIndex !== null
              ? rule.targetQuestionIndex
              : fallbackTarget === -1
                ? null
                : fallbackTarget,
        };
      }),
    }));
  };

  const changeTargetKind = (index: number, kind: "question" | "section") => {
    mutate((current) => ({
      ...current,
      logic: current.logic.map((rule, ruleIndex) => {
        if (ruleIndex !== index) return rule;
        if (kind === "section") {
          return {
            ...rule,
            targetQuestionIndex: null,
            targetSectionIndex:
              rule.targetSectionIndex ?? (current.sections.length > 0 ? 0 : null),
          };
        }
        const fallbackTarget = current.questions.findIndex(
          (_, questionIndex) => questionIndex !== rule.sourceQuestionIndex,
        );
        return {
          ...rule,
          targetSectionIndex: null,
          targetQuestionIndex:
            rule.targetQuestionIndex ??
            (fallbackTarget === -1 ? null : fallbackTarget),
        };
      }),
    }));
  };

  const setComparison = (index: number, key: string, value: unknown) => {
    mutate((current) => ({
      ...current,
      logic: current.logic.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, comparison: { [key]: value } } : rule,
      ),
    }));
  };

  const handleSave = useCallback(async () => {
    if (!formState || readOnly) return;
    const validationKey = validateFormState(formState, PUBLIC_SLUG);
    if (validationKey) {
      setErrorMsg(t(validationKey));
      return;
    }

    const definition = toDefinitionPayload(formState);
    try {
      parseFormInput(formDefinitionSchema, definition);
    } catch {
      setErrorMsg(t("editor.validationFailed"));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = { ...definition, updatedAt: formState.updatedAt };

    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const messageKey = await readErrorMessageKey(res);
        setErrorMsg(apiErrorMessage(messageKey, "forms.editor.saveFailed"));
        return;
      }

      const updated = (await res.json()) as { updatedAt: string };
      setFormState((current) =>
        current ? { ...current, updatedAt: updated.updatedAt } : current,
      );
      setBaseline(JSON.stringify(definition));
      pushToast({ title: t("editor.savedSuccess"), tone: "success" });
    } catch {
      setErrorMsg(t("editor.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [apiErrorMessage, formId, formState, pushToast, readOnly, t]);

  const saveRef = useRef(handleSave);

  useEffect(() => {
    saveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      if (!formState || readOnly) return;
      event.preventDefault();
      void saveRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [formState, readOnly]);

  const renderConfigEditor = (question: QuestionInput, questionIndex: number) => {
    const config = question.config;
    const patch = (values: Record<string, unknown>) =>
      updateQuestion(questionIndex, { config: { ...config, ...values } });
    const numberField = (
      labelKey: string,
      key: string,
      options?: { min?: number; max?: number; optional?: boolean },
    ) => {
      const value = config[key];
      const stringValue =
        value === null || value === undefined ? "" : String(value);
      return (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">{t(labelKey)}</span>
          <Input
            type="number"
            min={options?.min}
            max={options?.max}
            value={stringValue}
            disabled={readOnly}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                patch({ [key]: options?.optional ? null : 0 });
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) return;
              patch({ [key]: parsed });
            }}
            className="max-w-[12rem]"
          />
        </label>
      );
    };
    const textField = (labelKey: string, key: string, placeholderKey?: string) => (
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t(labelKey)}</span>
        <Input
          value={asString(config[key])}
          disabled={readOnly}
          placeholder={placeholderKey ? t(placeholderKey) : undefined}
          onChange={(event) => patch({ [key]: event.target.value })}
          className="max-w-sm"
        />
      </label>
    );
    const dateField = (labelKey: string, key: string) => (
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t(labelKey)}</span>
        <Input
          type="date"
          value={asString(config[key])}
          disabled={readOnly}
          onChange={(event) => patch({ [key]: event.target.value || null })}
          className="max-w-[12rem]"
        />
      </label>
    );
    const timeField = (labelKey: string, key: string) => (
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t(labelKey)}</span>
        <Input
          type="time"
          value={asString(config[key])}
          disabled={readOnly}
          onChange={(event) => patch({ [key]: event.target.value || null })}
          className="max-w-[10rem]"
        />
      </label>
    );

    switch (question.questionType) {
      case "short_answer":
      case "long_answer":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {numberField("editor.config.minLength", "minLength", { min: 0 })}
            {numberField("editor.config.maxLength", "maxLength", { min: 1 })}
            {question.questionType === "long_answer" &&
              numberField("editor.config.rows", "rows", { min: 3, max: 20 })}
            {textField(
              "editor.config.placeholder",
              "placeholder",
              "editor.config.placeholderHint",
            )}
          </div>
        );
      case "multiple_choice":
      case "checkboxes":
      case "dropdown":
        return (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={asBoolean(config.shuffleOptions)}
              disabled={readOnly}
              onChange={(event) => patch({ shuffleOptions: event.target.checked })}
            />
            <span>{t("editor.config.shuffleOptions")}</span>
          </label>
        );
      case "number":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {numberField("editor.config.min", "min", { optional: true })}
            {numberField("editor.config.max", "max", { optional: true })}
            {numberField("editor.config.step", "step", { min: 0, optional: true })}
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox
                checked={asBoolean(config.integer)}
                disabled={readOnly}
                onChange={(event) => patch({ integer: event.target.checked })}
              />
              <span>{t("editor.config.integer")}</span>
            </label>
          </div>
        );
      case "date":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {dateField("editor.config.minDate", "minDate")}
            {dateField("editor.config.maxDate", "maxDate")}
          </div>
        );
      case "time":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {timeField("editor.config.minTime", "minTime")}
            {timeField("editor.config.maxTime", "maxTime")}
          </div>
        );
      case "file_upload":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {numberField("editor.config.maxFiles", "maxFiles", { min: 1, max: 5 })}
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t("editor.config.maxSizeMb")}
              </span>
              <Input
                type="number"
                min={1}
                max={50}
                disabled={readOnly}
                value={String(
                  Math.round(
                    asNumber(config.maxSizeBytes, 10 * 1024 * 1024) / (1024 * 1024),
                  ),
                )}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed) || parsed < 1) return;
                  patch({ maxSizeBytes: parsed * 1024 * 1024 });
                }}
                className="max-w-[12rem]"
              />
            </label>
          </div>
        );
      case "rating":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {numberField("editor.config.ratingMax", "max", { min: 3, max: 10 })}
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t("editor.config.icon")}
              </span>
              <Select
                value={asString(config.icon, "star")}
                disabled={readOnly}
                onChange={(event) => patch({ icon: event.target.value })}
                className="max-w-[10rem]"
              >
                <option value="star">{t("editor.config.iconStar")}</option>
                <option value="heart">{t("editor.config.iconHeart")}</option>
              </Select>
            </label>
          </div>
        );
      case "linear_scale":
        return (
          <div className="flex flex-wrap items-end gap-4">
            {numberField("editor.config.scaleMin", "min", { min: 0, max: 5 })}
            {numberField("editor.config.scaleMax", "max", { min: 2, max: 10 })}
            {textField("editor.config.minLabel", "minLabel")}
            {textField("editor.config.maxLabel", "maxLabel")}
          </div>
        );
      default:
        return null;
    }
  };

  const renderOptionsEditor = (question: QuestionInput, questionIndex: number) => {
    if (!CHOICE_TYPES.has(question.questionType)) return null;
    const options = question.options;
    const updateOptions = (next: OptionInput[]) =>
      updateQuestion(questionIndex, { options: next });
    return (
      <div className="space-y-2 border-s-2 border-muted ps-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("editor.options")}
        </span>
        {options.map((option, optionIndex) => (
          <div key={optionIndex} className="flex items-center gap-2">
            <Input
              value={option.label}
              disabled={readOnly}
              aria-label={t("editor.optionLabel")}
              onChange={(event) => {
                const next = options.map((current, currentIndex) =>
                  currentIndex === optionIndex
                    ? { ...current, label: event.target.value }
                    : current,
                );
                updateOptions(next);
              }}
              className="h-9 max-w-sm text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={readOnly || options.length <= defaultOptionCount(question.questionType)}
              onClick={() =>
                updateOptions(options.filter((_, currentIndex) => currentIndex !== optionIndex))
              }
              aria-label={t("editor.removeOption")}
            >
              ×
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={readOnly || options.length >= 50}
          onClick={() =>
            updateOptions([
              ...options,
              { label: `${t("editor.defaultOption")} ${options.length + 1}` },
            ])
          }
        >
          + {t("editor.addOption")}
        </Button>
      </div>
    );
  };

  const renderPreviewQuestion = (question: QuestionInput, index: number) => {
    const config = question.config;
    const max = asNumber(config.max, 5);
    const scaleMin = asNumber(config.min, 1);
    const scaleMax = asNumber(config.max, 5);
    return (
      <Card key={question.key} className="space-y-3 p-6">
        <div className="text-lg font-semibold">
          {index + 1}. {question.prompt}
          {question.isRequired && <span className="ms-1 text-destructive">*</span>}
        </div>
        {question.description && (
          <p className="text-sm text-muted-foreground">{question.description}</p>
        )}

        {(question.questionType === "short_answer" ||
          question.questionType === "number" ||
          question.questionType === "date" ||
          question.questionType === "time") && (
          <Input
            disabled
            type={
              question.questionType === "number"
                ? "number"
                : question.questionType === "date"
                  ? "date"
                  : question.questionType === "time"
                    ? "time"
                    : "text"
            }
            placeholder={
              question.questionType === "short_answer"
                ? asString(config.placeholder)
                : undefined
            }
            className="max-w-md"
          />
        )}

        {question.questionType === "long_answer" && (
          <Textarea
            disabled
            rows={asNumber(config.rows, 5)}
            placeholder={asString(config.placeholder)}
          />
        )}

        {(question.questionType === "multiple_choice" ||
          question.questionType === "checkboxes") && (
          <div className="space-y-2">
            {question.options.map((option) => (
              <label key={option.label} className="flex items-center gap-2">
                <input
                  type={question.questionType === "checkboxes" ? "checkbox" : "radio"}
                  disabled
                  className="h-4 w-4"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {question.questionType === "dropdown" && (
          <Select disabled className="max-w-md">
            {question.options.map((option) => (
              <option key={option.label}>{option.label}</option>
            ))}
          </Select>
        )}

        {question.questionType === "file_upload" && (
          <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("editor.previewFileUpload", {
              count: asNumber(config.maxFiles, 1),
              size: Math.round(
                asNumber(config.maxSizeBytes, 10 * 1024 * 1024) / (1024 * 1024),
              ),
            })}
          </div>
        )}

        {question.questionType === "rating" && (
          <div className="flex gap-1 text-2xl text-amber-500">
            {Array.from({ length: max }, (_, ratingIndex) => (
              <span key={ratingIndex}>
                {asString(config.icon, "star") === "heart" ? "♥" : "★"}
              </span>
            ))}
          </div>
        )}

        {question.questionType === "linear_scale" && (
          <div className="flex items-center gap-4 text-sm">
            <span>{asString(config.minLabel) || scaleMin}</span>
            <input
              type="range"
              min={scaleMin}
              max={scaleMax}
              disabled
              className="w-48"
            />
            <span>{asString(config.maxLabel) || scaleMax}</span>
          </div>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div dir={dir} className="min-h-screen bg-background p-8 text-foreground">
        <div className="mx-auto max-w-4xl animate-pulse space-y-4">
          <div className="h-10 w-1/3 rounded bg-muted/50" />
          <div className="h-64 rounded bg-muted/30" />
        </div>
      </div>
    );
  }

  if (errorMsg && !formState) {
    return (
      <div
        dir={dir}
        className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground"
      >
        <Card className="max-w-md p-8 text-center">
          <span className="mb-2 block text-4xl" aria-hidden="true">
            ⚠️
          </span>
          <p className="mb-4 text-lg font-semibold">{errorMsg}</p>
          <Button onClick={retry}>{t("editor.retry")}</Button>
        </Card>
      </div>
    );
  }

  if (!formState) return null;

  const groupedSections = formState.sections.map((section, sectionIndex) => ({
    section,
    sectionIndex,
    questions: formState.questions
      .map((question, questionIndex) => ({ question, questionIndex }))
      .filter((entry) => entry.question.sectionIndex === sectionIndex),
  }));
  const unassignedQuestions = formState.questions
    .map((question, questionIndex) => ({ question, questionIndex }))
    .filter(
      (entry) =>
        entry.question.sectionIndex === null ||
        entry.question.sectionIndex >= formState.sections.length,
    );

  return (
    <div dir={dir} className="min-h-screen bg-background pb-20 text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/forms">
              <Button variant="ghost" size="sm">
                ← {t("editor.backToDashboard")}
              </Button>
            </Link>
            <h1 className="max-w-xs truncate text-lg font-bold">{formState.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && !readOnly && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {t("editor.unsavedChanges")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setPreviewMode(!previewMode)}>
              {previewMode ? t("editor.editMode") : t("editor.previewMode")}
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? t("editor.saving") : t("editor.saveDraft")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 pt-6">
        {readOnly && (
          <div className="rounded-md bg-amber-500/15 p-4 text-sm font-medium text-amber-700 dark:text-amber-300">
            {formState.submissionCount > 0
              ? t("editor.readOnlySubmissions")
              : t("editor.readOnlyStatus")}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md bg-destructive/15 p-4 text-sm font-medium text-destructive">
            {errorMsg}
          </div>
        )}

        {previewMode ? (
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="mb-2 text-2xl font-bold">{formState.title}</h2>
              {formState.description && (
                <p className="text-muted-foreground">{formState.description}</p>
              )}
            </Card>

            {formState.questions.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                {t("editor.emptyQuestions")}
              </Card>
            )}

            {groupedSections.map(({ section, sectionIndex, questions }) => {
              if (
                questions.length === 0 &&
                !section.title.trim() &&
                !section.description.trim()
              ) {
                return null;
              }
              return (
                <div key={section.key} className="space-y-4">
                  {sectionIndex > 0 && section.pageBreakBefore && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      {t("editor.pageBreak")}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">{section.title}</h3>
                    {section.description && (
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    )}
                  </div>
                  {questions.map(({ question, questionIndex }) =>
                    renderPreviewQuestion(question, questionIndex),
                  )}
                </div>
              );
            })}

            {unassignedQuestions.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">{t("editor.unassignedQuestions")}</h3>
                {unassignedQuestions.map(({ question, questionIndex }) =>
                  renderPreviewQuestion(question, questionIndex),
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("editor.formTitle")}
                </label>
                <Input
                  value={formState.title}
                  disabled={readOnly}
                  onChange={(event) =>
                    mutate((current) => ({ ...current, title: event.target.value }))
                  }
                  className="text-xl font-bold"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("editor.formDescription")}
                </label>
                <Textarea
                  value={formState.description}
                  disabled={readOnly}
                  rows={2}
                  onChange={(event) =>
                    mutate((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </div>
            </Card>

            <Card className="space-y-4 p-6">
              <h2 className="text-lg font-bold">{t("editor.settings")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-muted-foreground">
                    {t("editor.submissionMode")}
                  </span>
                  <Select
                    value={formState.submissionMode}
                    disabled={readOnly}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        submissionMode:
                          event.target.value === "anonymous" ? "anonymous" : "identified",
                      }))
                    }
                  >
                    <option value="identified">{t("editor.identified")}</option>
                    <option value="anonymous">{t("editor.anonymous")}</option>
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-muted-foreground">
                    {t("editor.publicSlug")}
                  </span>
                  <Input
                    value={formState.publicSlug}
                    disabled={readOnly || !formState.isPublic}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        publicSlug: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-muted-foreground">
                    {t("editor.confirmationMessage")}
                  </span>
                  <Textarea
                    value={formState.confirmationMessage}
                    disabled={readOnly}
                    rows={2}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        confirmationMessage: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.isPublic}
                    disabled={readOnly}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        isPublic: event.target.checked,
                      }))
                    }
                  />
                  <span>{t("editor.isPublic")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.acceptingResponses}
                    disabled={readOnly}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        acceptingResponses: event.target.checked,
                      }))
                    }
                  />
                  <span>{t("editor.acceptingResponses")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.settings.allowMultipleSubmissions}
                    disabled={readOnly}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        settings: {
                          ...current.settings,
                          allowMultipleSubmissions: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{t("editor.allowMultipleSubmissions")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.settings.shuffleQuestions}
                    disabled={readOnly}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        settings: {
                          ...current.settings,
                          shuffleQuestions: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{t("editor.shuffleQuestions")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.settings.showProgressBar}
                    disabled={readOnly}
                    onChange={(event) =>
                      mutate((current) => ({
                        ...current,
                        settings: {
                          ...current.settings,
                          showProgressBar: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{t("editor.showProgressBar")}</span>
                </label>
              </div>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{t("editor.sections")}</h2>
                <Button variant="outline" size="sm" disabled={readOnly} onClick={addSection}>
                  + {t("editor.addSection")}
                </Button>
              </div>
              {formState.sections.map((section, sectionIndex) => (
                <Card key={section.key} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={section.title}
                        disabled={readOnly}
                        aria-label={t("editor.sectionTitle")}
                        onChange={(event) =>
                          updateSection(sectionIndex, { title: event.target.value })
                        }
                        className="font-medium"
                      />
                      <Input
                        value={section.description}
                        disabled={readOnly}
                        aria-label={t("editor.sectionDescription")}
                        placeholder={t("editor.sectionDescription")}
                        onChange={(event) =>
                          updateSection(sectionIndex, { description: event.target.value })
                        }
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={section.pageBreakBefore}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateSection(sectionIndex, {
                              pageBreakBefore: event.target.checked,
                            })
                          }
                        />
                        <span>{t("editor.pageBreakBefore")}</span>
                      </label>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readOnly || sectionIndex === 0}
                          onClick={() => moveSection(sectionIndex, "up")}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readOnly || sectionIndex === formState.sections.length - 1}
                          onClick={() => moveSection(sectionIndex, "down")}
                        >
                          ↓
                        </Button>
                      </div>
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        disabled={
                          readOnly ||
                          formState.sections.length <= 1 ||
                          sectionIsUsed(sectionIndex)
                        }
                        title={
                          sectionIsUsed(sectionIndex)
                            ? t("editor.sectionInUse")
                            : undefined
                        }
                        onClick={() => deleteSection(sectionIndex)}
                      >
                        {t("editor.deleteSection")}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {t("editor.questions")} ({formState.questions.length})
                </h2>
                <Button size="sm" disabled={readOnly} onClick={() => addQuestion()}>
                  + {t("editor.addQuestion")}
                </Button>
              </div>

              {formState.questions.length === 0 && (
                <Card className="p-8 text-center text-muted-foreground">
                  {t("editor.emptyQuestions")}
                </Card>
              )}

              {formState.questions.map((question, questionIndex) => (
                <Card key={question.key} className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">
                          Q{questionIndex + 1}
                        </span>
                        <Input
                          value={question.prompt}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateQuestion(questionIndex, { prompt: event.target.value })
                          }
                          className="font-medium"
                        />
                      </div>

                      <Textarea
                        value={question.description}
                        disabled={readOnly}
                        rows={2}
                        placeholder={t("editor.questionDescription")}
                        onChange={(event) =>
                          updateQuestion(questionIndex, { description: event.target.value })
                        }
                      />

                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {t("editor.questionType")}
                          </span>
                          <Select
                            value={question.questionType}
                            disabled={readOnly}
                            onChange={(event) =>
                              changeQuestionType(
                                questionIndex,
                                asQuestionType(event.target.value),
                              )
                            }
                            className="max-w-[13rem]"
                          >
                            {QUESTION_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {t(`editor.qType.${type}`)}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {t("editor.section")}
                          </span>
                          <Select
                            value={
                              question.sectionIndex === null
                                ? "none"
                                : String(question.sectionIndex)
                            }
                            disabled={readOnly}
                            onChange={(event) =>
                              updateQuestion(questionIndex, {
                                sectionIndex:
                                  event.target.value === "none"
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                            className="max-w-[14rem]"
                          >
                            <option value="none">{t("editor.noSection")}</option>
                            {formState.sections.map((section, sectionIndex) => (
                              <option key={section.key} value={sectionIndex}>
                                {section.title || `${t("editor.sectionDefaultTitle")} ${sectionIndex + 1}`}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="flex cursor-pointer items-center gap-1.5">
                          <Checkbox
                            checked={question.isRequired}
                            disabled={readOnly}
                            onChange={(event) =>
                              updateQuestion(questionIndex, {
                                isRequired: event.target.checked,
                              })
                            }
                          />
                          <span>{t("editor.required")}</span>
                        </label>
                      </div>

                      {renderConfigEditor(question, questionIndex)}
                      {renderOptionsEditor(question, questionIndex)}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readOnly || questionIndex === 0}
                          onClick={() => moveQuestion(questionIndex, "up")}
                          title={t("editor.moveUp")}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            readOnly || questionIndex === formState.questions.length - 1
                          }
                          onClick={() => moveQuestion(questionIndex, "down")}
                          title={t("editor.moveDown")}
                        >
                          ↓
                        </Button>
                      </div>
                      <div className="mt-2 flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={readOnly}
                          onClick={() => duplicateQuestion(questionIndex)}
                        >
                          {t("editor.duplicateQuestion")}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={readOnly}
                          onClick={() => deleteQuestion(questionIndex)}
                        >
                          {t("editor.deleteQuestion")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">
                  {t("editor.logic")} ({formState.logic.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={readOnly || formState.questions.length < 2}
                  onClick={addLogicRule}
                >
                  + {t("editor.addLogicRule")}
                </Button>
              </div>

              {formState.logic.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("editor.noLogicRules")}</p>
              )}

              {formState.logic.map((rule, ruleIndex) => {
                const source = formState.questions[rule.sourceQuestionIndex];
                const targetKind =
                  rule.targetQuestionIndex !== null ? "question" : "section";
                const needsComparison =
                  rule.operator !== "is_answered" &&
                  rule.operator !== "is_not_answered";
                return (
                  <div
                    key={rule.key}
                    className="flex flex-wrap items-end gap-2 rounded border bg-muted/20 p-3 text-sm"
                  >
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">{t("editor.logicSource")}</span>
                      <Select
                        value={String(rule.sourceQuestionIndex)}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateRule(ruleIndex, {
                            sourceQuestionIndex: Number(event.target.value),
                            comparison: {},
                          })
                        }
                        className="max-w-[11rem]"
                      >
                        {formState.questions.map((question, questionIndex) => (
                          <option key={question.key} value={questionIndex}>
                            Q{questionIndex + 1}: {question.prompt.slice(0, 40)}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">
                        {t("editor.logicOperator")}
                      </span>
                      <Select
                        value={rule.operator}
                        disabled={readOnly}
                        onChange={(event) =>
                          changeOperator(ruleIndex, asOperator(event.target.value))
                        }
                        className="max-w-[11rem]"
                      >
                        {OPERATORS.map((operator) => (
                          <option key={operator} value={operator}>
                            {t(`editor.logic.operator.${operator}`)}
                          </option>
                        ))}
                      </Select>
                    </label>

                    {needsComparison && source && (
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">
                          {t("editor.logicComparison")}
                        </span>
                        {CHOICE_TYPES.has(source.questionType) ? (
                          <Select
                            value={String(asOptionalNumber(rule.comparison.optionIndex) ?? 0)}
                            disabled={readOnly}
                            onChange={(event) =>
                              setComparison(
                                ruleIndex,
                                "optionIndex",
                                Number(event.target.value),
                              )
                            }
                            className="max-w-[12rem]"
                          >
                            {source.options.map((option, optionIndex) => (
                              <option key={optionIndex} value={optionIndex}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        ) : source.questionType === "date" ? (
                          <Input
                            type="date"
                            disabled={readOnly}
                            value={asString(rule.comparison.date)}
                            onChange={(event) =>
                              setComparison(ruleIndex, "date", event.target.value)
                            }
                            className="max-w-[10rem]"
                          />
                        ) : source.questionType === "time" ? (
                          <Input
                            type="time"
                            disabled={readOnly}
                            value={asString(rule.comparison.time)}
                            onChange={(event) =>
                              setComparison(ruleIndex, "time", event.target.value)
                            }
                            className="max-w-[9rem]"
                          />
                        ) : source.questionType === "number" ||
                          source.questionType === "rating" ||
                          source.questionType === "linear_scale" ||
                          rule.operator === "greater_than" ||
                          rule.operator === "less_than" ? (
                          <Input
                            type="number"
                            disabled={readOnly}
                            value={
                              asOptionalNumber(rule.comparison.number) === null
                                ? ""
                                : String(rule.comparison.number)
                            }
                            onChange={(event) =>
                              setComparison(
                                ruleIndex,
                                "number",
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                              )
                            }
                            className="max-w-[8rem]"
                          />
                        ) : (
                          <Input
                            disabled={readOnly}
                            value={asString(rule.comparison.text)}
                            onChange={(event) =>
                              setComparison(ruleIndex, "text", event.target.value)
                            }
                            className="max-w-[12rem]"
                          />
                        )}
                      </div>
                    )}

                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">
                        {t("editor.logicAction")}
                      </span>
                      <Select
                        value={rule.action}
                        disabled={readOnly}
                        onChange={(event) =>
                          changeAction(ruleIndex, asAction(event.target.value))
                        }
                        className="max-w-[9rem]"
                      >
                        {ACTIONS.map((action) => (
                          <option key={action} value={action}>
                            {t(`editor.logic.action.${action}`)}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">
                        {t("editor.logicTarget")}
                      </span>
                      <Select
                        value={targetKind}
                        disabled={readOnly || rule.action === "require"}
                        onChange={(event) =>
                          changeTargetKind(
                            ruleIndex,
                            event.target.value === "section" ? "section" : "question",
                          )
                        }
                        className="max-w-[9rem]"
                      >
                        <option value="question">{t("editor.targetQuestion")}</option>
                        <option value="section">{t("editor.targetSection")}</option>
                      </Select>
                    </label>

                    {targetKind === "question" ? (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">
                          {t("editor.targetQuestion")}
                        </span>
                        <Select
                          value={
                            rule.targetQuestionIndex === null
                              ? "none"
                              : String(rule.targetQuestionIndex)
                          }
                          disabled={readOnly}
                          onChange={(event) =>
                            updateRule(ruleIndex, {
                              targetQuestionIndex:
                                event.target.value === "none"
                                  ? null
                                  : Number(event.target.value),
                              targetSectionIndex: null,
                            })
                          }
                          className="max-w-[12rem]"
                        >
                          <option value="none">{t("editor.noTarget")}</option>
                          {formState.questions.map((question, questionIndex) =>
                            questionIndex === rule.sourceQuestionIndex ? null : (
                              <option key={question.key} value={questionIndex}>
                                Q{questionIndex + 1}: {question.prompt.slice(0, 40)}
                              </option>
                            ),
                          )}
                        </Select>
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">
                          {t("editor.targetSection")}
                        </span>
                        <Select
                          value={
                            rule.targetSectionIndex === null
                              ? "none"
                              : String(rule.targetSectionIndex)
                          }
                          disabled={readOnly}
                          onChange={(event) =>
                            updateRule(ruleIndex, {
                              targetSectionIndex:
                                event.target.value === "none"
                                  ? null
                                  : Number(event.target.value),
                              targetQuestionIndex: null,
                            })
                          }
                          className="max-w-[12rem]"
                        >
                          <option value="none">{t("editor.noTarget")}</option>
                          {formState.sections.map((section, sectionIndex) => (
                            <option key={section.key} value={sectionIndex}>
                              {section.title || `${t("editor.sectionDefaultTitle")} ${sectionIndex + 1}`}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}

                    <Button
                      variant="danger-ghost"
                      size="sm"
                      disabled={readOnly}
                      onClick={() => removeRule(ruleIndex)}
                      className="ms-auto"
                    >
                      {t("editor.removeRule")}
                    </Button>
                  </div>
                );
              })}
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/forms")}
              >
                {t("editor.cancel")}
              </Button>
              {!readOnly && (
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving ? t("editor.saving") : t("editor.saveDraft")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
