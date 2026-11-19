"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  currentTerm,
  previousTerm,
  type TermView,
} from "@/modules/terms/resolution";

type FormState = {
  name: string;
  grade: string;
  startDate: string;
  endDate: string;
};

const emptyForm: FormState = { name: "", grade: "", startDate: "", endDate: "" };

export function AcademicTermsClient({
  initialTerms,
  gradeOptions,
  canWrite,
  today,
}: {
  initialTerms: TermView[];
  gradeOptions: string[];
  canWrite: boolean;
  today: string;
}) {
  const t = useTranslations("AcademicTerms");
  const [terms, setTerms] = useState<TermView[]>(initialTerms);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TermView | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // `initialTerms` is the server-rendered truth at page load. Refresh only in
  // response to a mutation (an event handler), never from an effect body.
  async function load() {
    setBusy(true);
    setLoadFailed(false);
    try {
      const response = await fetch("/api/terms", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setTerms((await response.json()) as TermView[]);
    } catch {
      setLoadFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setSaveFailed(false);
    setDialogOpen(true);
  }

  function openEdit(term: TermView) {
    setForm({
      name: term.name,
      grade: term.grade ?? "",
      startDate: term.startDate,
      endDate: term.endDate,
    });
    setEditingId(term.id);
    setSaveFailed(false);
    setDialogOpen(true);
  }

  async function save() {
    setBusy(true);
    setSaveFailed(false);
    try {
      const response = await fetch(editingId ? `/api/terms/${editingId}` : "/api/terms", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error();
      setDialogOpen(false);
      await load();
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setBusy(true);
    setSaveFailed(false);
    try {
      const response = await fetch(`/api/terms/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setDeleteTarget(null);
      await load();
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!canWrite ? <Alert tone="warning">{t("readOnly")}</Alert> : null}
      {loadFailed ? <Alert tone="danger">{t("loadFailed")}</Alert> : null}
      {saveFailed ? <Alert tone="danger">{t("createFailed")}</Alert> : null}
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="button" onClick={openCreate} disabled={busy}>
            {t("create")}
          </Button>
        </div>
      ) : null}

      {terms.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--fg-muted)]">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t("tableCaption")}</caption>
            <thead>
              <tr>
                <th className="p-2 text-start">{t("name")}</th>
                <th className="p-2 text-start">{t("grade")}</th>
                <th className="p-2 text-start">{t("startDate")}</th>
                <th className="p-2 text-start">{t("endDate")}</th>
                <th className="p-2 text-start">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((term) => {
                const isCurrent = currentTerm(terms, today, term.grade)?.id === term.id;
                const isPrevious = previousTerm(terms, currentTerm(terms, today, term.grade), term.grade)?.id === term.id;
                return (
                  <tr key={term.id} className="border-t border-[var(--border-subtle)]">
                    <td className="p-2 font-medium">
                      {term.name}
                      {isCurrent ? (
                        <Badge tone="primary" className="ms-2">{t("currentBadge")}</Badge>
                      ) : null}
                      {isPrevious ? (
                        <Badge tone="outline" className="ms-2">{t("previousBadge")}</Badge>
                      ) : null}
                    </td>
                    <td className="p-2">{term.grade ?? t("allGrades")}</td>
                    <td className="p-2" dir="ltr">{term.startDate}</td>
                    <td className="p-2" dir="ltr">{term.endDate}</td>
                    <td className="p-2">
                      {canWrite ? (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(term)}>
                            {t("editTitle")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(term)}
                          >
                            {t("confirmDelete")}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={editingId ? t("editTitle") : t("addTitle")}>
        <div className="grid gap-3 py-2">
          <label className="grid gap-1 text-sm">
            <span>{t("name")}</span>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t("grade")}</span>
            <Input
              list="academic-term-grades"
              value={form.grade}
              onChange={(event) => setForm({ ...form, grade: event.currentTarget.value })}
              placeholder={t("allGrades")}
            />
            <datalist id="academic-term-grades">
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t("startDate")}</span>
            <Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.currentTarget.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t("endDate")}</span>
            <Input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.currentTarget.value })} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || !form.name.trim() || !form.startDate || !form.endDate}
              onClick={() => void save()}
            >
              {busy ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>
            {t("confirmDelete")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
