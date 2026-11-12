"use client";

import { useCallback, useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, ErrorState } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

/**
 * The student's attendance QR card.
 *
 * ONE purpose: attendance identification for `scanStudentQrCode`. It is not a
 * sign-in credential, cannot authenticate anyone anywhere, and carries an
 * opaque HMAC-signed payload (`kqr_v1.<studentId>.<nonce>.<signature>`) with
 * no name, phone, or other personal data. Re-issuing invalidates the previous
 * identifier immediately; revoking clears it entirely until the next issue.
 */

export type AttendanceQrCopy = {
  title: string;
  subtitle: string;
  loading: string;
  loadFailed: string;
  retry: string;
  print: string;
  downloadSvg: string;
  downloadPng: string;
  reissue: string;
  reissueTitle: string;
  reissueDescription: string;
  revoke: string;
  revokeTitle: string;
  revokeDescription: string;
  confirm: string;
  cancel: string;
  noQrTitle: string;
  noQrHint: string;
  create: string;
  working: string;
};

type QrState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "active"; token: string };

export function StudentAttendanceQr({
  studentId,
  studentName,
  grade,
  copy,
}: {
  studentId: string;
  studentName: string;
  grade?: string | null;
  copy: AttendanceQrCopy;
}) {
  const [state, setState] = useState<QrState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [showReissue, setShowReissue] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/${studentId}/qr`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setState({ kind: "error" });
        return;
      }
      const data = (await res.json()) as {
        status?: "active" | "disabled";
        token?: string;
      };
      if (data.status === "disabled" || !data.token) {
        setState({ kind: "unavailable" });
        return;
      }
      setState({ kind: "active", token: data.token });
    } catch {
      setState({ kind: "error" });
    }
  }, [studentId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/students/${studentId}/qr`, { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setState({ kind: "error" });
          return;
        }
        const data = (await res.json()) as {
          status?: "active" | "disabled";
          token?: string;
        };
        if (!active) return;
        if (data.status === "disabled" || !data.token) {
          setState({ kind: "unavailable" });
          return;
        }
        setState({ kind: "active", token: data.token });
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, [studentId]);

  const handleRotate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/students/${studentId}/qr`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { token: string };
      setState({ kind: "active", token: data.token });
      setShowReissue(false);
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/students/${studentId}/qr`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setState({ kind: "unavailable" });
      setShowRevoke(false);
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const token = state.kind === "active" ? state.token : null;

  let svgTag = "";
  if (token) {
    try {
      const qr = qrcode(0, "M");
      qr.addData(token);
      qr.make();
      svgTag = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
    } catch {
      svgTag = "";
    }
  }

  const sizedSvg = () => svgTag.replace("<svg ", '<svg width="512" height="512" ');

  const downloadSvg = () => {
    if (!svgTag) return;
    triggerDownload(
      new Blob([sizedSvg()], { type: "image/svg+xml;charset=utf-8" }),
      `kashkol-attendance-qr-${studentId.slice(0, 8)}.svg`,
    );
  };

  const downloadPng = () => {
    if (!svgTag) return;
    const svgBlob = new Blob([sizedSvg()], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(svgUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      canvas.toBlob((blob) => {
        if (blob) {
          triggerDownload(blob, `kashkol-attendance-qr-${studentId.slice(0, 8)}.png`);
        }
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(svgUrl);
    img.src = svgUrl;
  };

  if (state.kind === "loading") {
    return (
      <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
        {copy.loading}
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <ErrorState
        title={copy.loadFailed}
        description={copy.retry}
        action={
          <Button onClick={fetchToken} variant="secondary" size="sm">
            {copy.retry}
          </Button>
        }
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--border-base)] bg-[var(--color-surface-subtle)] p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{copy.noQrTitle}</p>
          <p className="text-xs text-muted">{copy.noQrHint}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void handleRotate()}
          className="gap-1.5"
        >
          <Icon name="qr" size={14} />
          <span>{busy ? copy.working : copy.create}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <Alert variant="info" title={copy.title}>
        {copy.subtitle}
      </Alert>

      <Card className="print:border-none print:shadow-none border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <CardBody className="p-6 flex flex-col items-center text-center space-y-3">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-[var(--fg-base)]">{studentName}</h3>
            {grade && <p className="text-sm text-[var(--fg-muted)]">{grade}</p>}
          </div>

          <div
            className="w-44 h-44 p-2 bg-white rounded-lg border border-[var(--border-base)] shadow-inner flex items-center justify-center [&_svg]:w-full [&_svg]:h-full"
            dangerouslySetInnerHTML={{ __html: svgTag }}
          />

          <p className="text-xs text-[var(--fg-subtle)]" dir="ltr">
            ID: {studentId.slice(0, 8)}...{studentId.slice(-4)}
          </p>

          <div className="flex gap-2 pt-2 border-t border-[var(--border-subtle)] w-full justify-center flex-wrap print:hidden">
            <Button onClick={() => window.print()} variant="primary" size="sm" className="gap-2">
              <Icon name="download" className="h-4 w-4" />
              {copy.print}
            </Button>
            <Button onClick={downloadSvg} variant="secondary" size="sm" className="gap-2">
              <Icon name="download" className="h-4 w-4" />
              {copy.downloadSvg}
            </Button>
            <Button onClick={downloadPng} variant="secondary" size="sm" className="gap-2">
              <Icon name="download" className="h-4 w-4" />
              {copy.downloadPng}
            </Button>
            <Button
              onClick={() => setShowReissue(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Icon name="refresh" className="h-4 w-4" />
              {copy.reissue}
            </Button>
            <Button
              onClick={() => setShowRevoke(true)}
              variant="ghost"
              size="sm"
              className="gap-2 text-[var(--status-danger)] hover:bg-[var(--status-danger-subtle)]"
            >
              <Icon name="x" className="h-4 w-4" />
              {copy.revoke}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={showReissue}
        onOpenChange={setShowReissue}
        title={copy.reissueTitle}
        description={copy.reissueDescription}
      >
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowReissue(false)}
            disabled={busy}
          >
            {copy.cancel}
          </Button>
          <Button type="button" variant="danger" onClick={() => void handleRotate()} disabled={busy}>
            {busy ? copy.working : copy.confirm}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={showRevoke}
        onOpenChange={setShowRevoke}
        title={copy.revokeTitle}
        description={copy.revokeDescription}
      >
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowRevoke(false)}
            disabled={busy}
          >
            {copy.cancel}
          </Button>
          <Button type="button" variant="danger" onClick={() => void handleRevoke()} disabled={busy}>
            {busy ? copy.working : copy.confirm}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
