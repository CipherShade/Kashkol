"use client";

import { useEffect, useState, useCallback } from "react";
import qrcode from "qrcode-generator";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Alert, ErrorState } from "@/components/ui/feedback";

interface StudentQrTabProps {
  studentId: string;
  studentName: string;
  grade?: string | null;
  locale: string;
}

export function StudentQrTab({ studentId, studentName, grade, locale }: StudentQrTabProps) {
  const isAr = locale === "ar";
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [showRotateDialog, setShowRotateDialog] = useState<boolean>(false);

  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/students/${studentId}/qr`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setToken(data.token);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/students/${studentId}/qr`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) {
          setToken(data.token);
          setLoading(false);
        }
      } catch {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [studentId]);

  const handleRotate = async () => {
    setIsRotating(true);
    try {
      const res = await fetch(`/api/students/${studentId}/qr`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setToken(data.token);
      setShowRotateDialog(false);
    } catch {
      setError(true);
    } finally {
      setIsRotating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate SVG string using qrcode-generator
  let svgTag = "";
  if (token) {
    try {
      const qr = qrcode(0, "M");
      qr.addData(token);
      qr.make();
      svgTag = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
    } catch {
      // Fallback
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-[var(--fg-muted)]">
        {isAr ? "جارٍ تجهيز رمز QR..." : "Loading QR code..."}
      </div>
    );
  }

  if (error || !token) {
    return (
      <ErrorState
        title={isAr ? "تعذر تحميل رمز QR" : "Failed to load QR code"}
        description={isAr ? "يرجى المحاولة مرة أخرى." : "Please try again."}
        action={
          <Button onClick={fetchToken} variant="secondary" size="sm">
            {isAr ? "إعادة المحاولة" : "Retry"}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Informational banner */}
      <Alert variant="info" title={isAr ? "بطاقة الحضور الذكية" : "Smart Attendance Card"}>
        {isAr
          ? "هذا الرمز مخصص للطالب ويظل صالحًا طوال العام الدراسي لجميع المجموعات والحصص. عند مسحه من قبل المساعد، يُسجَّل حضور الطالب فورًا."
          : "This QR code uniquely identifies the student across all sessions and groups. When scanned by an assistant, attendance is recorded instantly."}
      </Alert>

      {/* Printable Card */}
      <Card className="print:border-none print:shadow-none border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <CardBody className="p-8 flex flex-col items-center text-center space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[var(--fg-base)]">{studentName}</h2>
            {grade && <p className="text-sm text-[var(--fg-muted)]">{grade}</p>}
          </div>

          {/* QR Code Container */}
          <div
            className="w-56 h-56 p-2 bg-white rounded-lg border border-[var(--border-base)] shadow-inner flex items-center justify-center [&_svg]:w-full [&_svg]:h-full"
            dangerouslySetInnerHTML={{ __html: svgTag }}
          />

          <p className="text-xs text-[var(--fg-subtle)]" dir="ltr">
            ID: {studentId.slice(0, 8)}...{studentId.slice(-4)}
          </p>

          {/* Action buttons (hidden when printing) */}
          <div className="flex gap-3 pt-4 border-t border-[var(--border-subtle)] w-full justify-center print:hidden">
            <Button onClick={handlePrint} variant="primary" size="sm" className="gap-2">
              <Icon name="download" className="h-4 w-4" />
              {isAr ? "طباعة البطاقة" : "Print Card"}
            </Button>
            <Button
              onClick={() => setShowRotateDialog(true)}
              variant="outline"
              size="sm"
              className="gap-2 text-[var(--status-danger)] hover:bg-[var(--status-danger-subtle)]"
            >
              <Icon name="history" className="h-4 w-4" />
              {isAr ? "إعادة إصدار الرمز" : "Re-issue Code"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Confirmation Dialog for Token Rotation */}
      <Dialog
        open={showRotateDialog}
        onOpenChange={setShowRotateDialog}
        title={isAr ? "تأكيد إعادة إصدار رمز QR" : "Confirm QR Code Re-issuance"}
        description={
          isAr
            ? "سيؤدي هذا الإجراء إلى إلغاء الرمز القديم فورًا، ولن يعمل أي كارت مطبوع سابقًا. هل أنت متأكد؟"
            : "This will invalidate the existing QR code immediately. Any previously printed card will stop working. Are you sure?"
        }
      >
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowRotateDialog(false)}
            disabled={isRotating}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleRotate}
            disabled={isRotating}
          >
            {isRotating
              ? isAr
                ? "جارٍ الإصدار..."
                : "Re-issuing..."
              : isAr
                ? "نعم، أعد إصدار الرمز"
                : "Yes, Re-issue"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
