"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { readErrorMessageKey, useApiErrorMessage } from "@/modules/forms/client-api";

export const dynamic = "force-dynamic";

export default function NewFormPage() {
  const t = useTranslations("forms.new");
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const router = useRouter();
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          submissionMode: "identified",
          sections: [{ title: t("defaultSectionTitle"), pageBreakBefore: false }],
          questions: [],
          logic: [],
        }),
      });
      if (!res.ok) {
        const messageKey = await readErrorMessageKey(res);
        setErrorMsg(apiErrorMessage(messageKey, "forms.new.failed"));
        setCreating(false);
        return;
      }
      const created = (await res.json()) as { id: string };
      router.push(`/forms/${created.id}/edit`);
    } catch {
      setErrorMsg(t("failed"));
      setCreating(false);
    }
  };

  return (
    <div dir={dir} className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-lg px-4 py-12">
        <Link href="/forms">
          <Button variant="ghost" size="sm">
            ← {t("back")}
          </Button>
        </Link>

        <Card className="mt-6 p-6">
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

          <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div>
              <label
                htmlFor="form-title"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {t("nameLabel")}
              </label>
              <Input
                id="form-title"
                value={title}
                required
                maxLength={160}
                autoFocus
                disabled={creating}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            {errorMsg && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Link href="/forms">
                <Button variant="outline" type="button" disabled={creating}>
                  {t("back")}
                </Button>
              </Link>
              <Button type="submit" disabled={creating || !title.trim()}>
                {creating ? t("creating") : t("submit")}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
