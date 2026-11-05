"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { readErrorMessageKey, useApiErrorMessage } from "@/modules/forms/client-api";

export const dynamic = "force-dynamic";

interface FormListItem {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  publicSlug: string | null;
  updatedAt: string;
}

export default function FormsDashboardPage() {
  const t = useTranslations("forms");
  const apiErrorMessage = useApiErrorMessage();
  const pushToast = useToast();
  const locale = useLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [actionPending, setActionPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/forms");
        if (!res.ok) throw new Error("fetch failed");
        const data: unknown = await res.json();
        if (cancelled) return;
        setForms(Array.isArray(data) ? (data as FormListItem[]) : []);
        setErrorMsg(null);
      } catch {
        if (cancelled) return;
        setForms([]);
        setErrorMsg(t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, t]);

  const retry = () => {
    setLoading(true);
    setErrorMsg(null);
    setReloadToken((token) => token + 1);
  };

  const runAction = async (
    formId: string,
    action: "publish" | "archive" | "duplicate",
  ) => {
    setActionPending(`${formId}:${action}`);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/forms/${formId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const messageKey = await readErrorMessageKey(res);
        setErrorMsg(apiErrorMessage(messageKey, "forms.actionFailed"));
        return;
      }
      pushToast({ title: t(`actionSuccess.${action}`), tone: "success" });
      setReloadToken((token) => token + 1);
    } catch {
      setErrorMsg(t("actionFailed"));
    } finally {
      setActionPending(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return forms;
    const s = search.toLowerCase();
    return forms.filter((f) => f.title.toLowerCase().includes(s) || (f.publicSlug || "").includes(s));
  }, [forms, search]);

  const statusColor = (status: string) => {
    if (status === "draft") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200";
    if (status === "published") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
  };

  return (
    <div dir={dir} className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("dashboardTitle")}</h1>
            <p className="text-muted-foreground mt-1">{t("dashboardSubtitle")}</p>
          </div>
          <Link href="/forms/new">
            <Button className="gap-2">
              <span aria-hidden="true">➕</span> {t("createForm")}
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="max-w-md"
            aria-label={t("searchPlaceholder")}
          />
        </div>

        {errorMsg && forms.length > 0 && (
          <div className="mb-6 rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="flex h-40 flex-col gap-3 p-6">
                <Skeleton width="70%" height="1.25rem" />
                <Skeleton width="40%" />
                <Skeleton width="100%" height="2rem" className="mt-auto" />
              </Card>
            ))}
          </div>
        ) : errorMsg && forms.length === 0 ? (
          <Card className="p-10 text-center">
            <span className="text-5xl mb-3" aria-hidden="true">⚠️</span>
            <p className="font-medium">{errorMsg}</p>
            <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={retry}>
              ↻ {t("retry")}
            </Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <span className="text-5xl mx-auto mb-3 opacity-50" aria-hidden="true">📋</span>
            <p className="font-medium">{t("noForms")}</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((form) => (
              <Card key={form.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-lg leading-snug truncate">{form.title}</h3>
                  <Badge className={statusColor(form.status)} variant="secondary">{t(`status.${form.status}`)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{new Date(form.updatedAt).toLocaleDateString()}</div>
                <div className="flex items-center gap-2 mt-auto pt-2">
                  <Link href={`/forms/${form.id}/edit`}>
                    <Button variant="outline" size="sm" className="gap-1">✏ {t("edit")}</Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={actionPending !== null}
                    onClick={() => void runAction(form.id, "duplicate")}
                  >
                    ⧉ {t("duplicate")}
                  </Button>
                  {form.status === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={actionPending !== null}
                      onClick={() => void runAction(form.id, "publish")}
                    >
                      🚀 {t("publish")}
                    </Button>
                  )}
                  {form.status === "published" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={actionPending !== null}
                      onClick={() => void runAction(form.id, "archive")}
                    >
                      ⏚ {t("archive")}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
