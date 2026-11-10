"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import jsQR from "jsqr";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { RecentTokenCache } from "@/lib/attendance/recent-tokens";

interface QrScannerPanelProps {
  sessionId: string;
  onScanSuccess: (result: {
    student: { id: string; firstName: string; lastName: string };
    mark: {
      id: string;
      mark: string;
      paymentVerified: boolean;
      isCrossSeason: boolean;
    };
    isCrossSeason: boolean;
  }) => void;
  onClose: () => void;
}

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

// Decode frames at ~15fps into a small canvas: jsQR cost is proportional to
// pixels, and the camera rarely needs more resolution to read a printed QR.
const MAX_DECODE_DIMENSION = 480;
const FRAME_INTERVAL_MS = 66;

export function QrScannerPanel({ sessionId, onScanSuccess, onClose }: QrScannerPanelProps) {
  const t = useTranslations("Sessions.attendance");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recentTokensRef = useRef(new RecentTokenCache(4000));
  const submittingRef = useRef(false);
  const detectorRef = useRef<BarcodeDetectorLike | null | undefined>(undefined);
  const detectBusyRef = useRef(false);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>("");
  const [lastScanMessage, setLastScanMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
    studentName?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const playBeep = useCallback((success: boolean) => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(success ? 880 : 220, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (success ? 0.15 : 0.3));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (success ? 0.15 : 0.3));
    } catch {
      // Audio not supported or blocked; safe to ignore
    }
  }, []);

  const handleTokenDetected = useCallback(
    async (token: string) => {
      // A student at a time: one scan POST is in flight at most, and the same
      // token is not re-POSTed while it is visible to the camera.
      if (submittingRef.current) return;
      if (!recentTokensRef.current.accept(token)) return;

      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/attendance/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            qrToken: token.trim(),
            paymentVerified: false,
            markLate: false,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          playBeep(false);
          const code = data?.error?.code;
          if (code === "CONFLICT") {
            setLastScanMessage({ type: "warning", text: t("scanDuplicate") });
          } else if (code === "NOT_FOUND") {
            setLastScanMessage({ type: "error", text: t("scanNotEnrolled") });
          } else {
            setLastScanMessage({ type: "error", text: t("scanInvalid") });
          }
          return;
        }

        playBeep(true);
        try {
          navigator.vibrate?.(60);
        } catch {
          // Haptics not available; safe to ignore
        }

        const studentName = `${data.student.firstName} ${data.student.lastName}`.trim();
        setLastScanMessage({
          type: "success",
          text: t("scanSuccess"),
          studentName: data.isCrossSeason
            ? `${studentName} (${t("crossSeasonBadge")})`
            : studentName,
        });

        onScanSuccess({
          student: data.student,
          mark: data.mark,
          isCrossSeason: data.isCrossSeason,
        });
      } catch {
        playBeep(false);
        setLastScanMessage({ type: "error", text: t("cameraError") });
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [sessionId, playBeep, t, onScanSuccess],
  );

  // Camera stream setup. Depends only on `t`: the stream is acquired once and
  // persists across scans. Scan submissions toggle refs, never this effect.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;
    let isCancelled = false;
    let lastFrameAt = 0;

    function supportedBarcodeDetector(): BarcodeDetectorLike | null {
      if (detectorRef.current !== undefined) return detectorRef.current;
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      detectorRef.current = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
      return detectorRef.current;
    }

    async function startCamera() {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setHasCamera(false);
        setCameraError(t("cameraNotSupported"));
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play();
          requestScanFrame();
        }
      } catch (err) {
        const error = err as Error;
        setHasCamera(false);
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setCameraError(t("cameraDenied"));
        } else {
          setCameraError(t("cameraError"));
        }
      }
    }

    function requestScanFrame() {
      if (isCancelled) return;
      animationFrameId = requestAnimationFrame(scanVideoFrame);
    }

    function scanVideoFrame(now: number) {
      if (isCancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && now - lastFrameAt >= FRAME_INTERVAL_MS) {
        lastFrameAt = now;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const detector = supportedBarcodeDetector();
          if (detector) {
            // BarcodeDetector is hardware/OS-backed where available; run it
            // single-flight so frames are never queued behind a detection.
            if (!detectBusyRef.current) {
              detectBusyRef.current = true;
              detector
                .detect(canvas)
                .then((results) => {
                  const raw = results[0]?.rawValue;
                  if (raw && raw.startsWith("kqr_v1.")) void handleTokenDetected(raw);
                })
                .catch(() => {
                  // Detector failure is non-fatal; frame loop keeps running.
                })
                .finally(() => {
                  detectBusyRef.current = false;
                });
            }
          } else {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data?.startsWith("kqr_v1.")) {
              void handleTokenDetected(code.data);
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(scanVideoFrame);
    }

    startCamera();

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [handleTokenDetected, t]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      void handleTokenDetected(manualCode.trim());
      setManualCode("");
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 shadow-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <Icon name="qr" className="h-5 w-5 text-[var(--fg-accent)]" />
          <h3 className="text-base font-semibold text-[var(--fg-base)]">{t("scanningTitle")}</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("closeKeepOpen")}>
          <Icon name="x" className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-[var(--fg-muted)]">{t("scanningInstructions")}</p>

      {/* Camera Viewport */}
      {hasCamera ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Targeting reticle overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-48 w-48 rounded-lg border-2 border-dashed transition-colors duration-150 ${
                isSubmitting
                  ? "border-[var(--status-success)] bg-[var(--status-success)]/10"
                  : "border-white/70"
              }`}
            />
          </div>

          {isSubmitting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-sm font-medium text-white">{t("scanRecording")}</span>
            </div>
          )}
        </div>
      ) : (
        <Alert variant="warning" title={t("cameraNotSupported")}>
          {cameraError ?? t("cameraNotSupported")}
        </Alert>
      )}

      {/* Last Scan Status Feedback */}
      {lastScanMessage && (
        <div
          role={lastScanMessage.type === "success" ? "status" : "alert"}
          aria-live="polite"
          className={`rounded-md p-3 text-sm font-medium transition-all ${
            lastScanMessage.type === "success"
              ? "bg-[var(--status-success-subtle)] text-[var(--status-success)] border border-[var(--status-success)]"
              : lastScanMessage.type === "warning"
                ? "bg-[var(--status-warning-subtle)] text-[var(--status-warning)] border border-[var(--status-warning)]"
                : "bg-[var(--status-danger-subtle)] text-[var(--status-danger)] border border-[var(--status-danger)]"
          }`}
        >
          {lastScanMessage.studentName && (
            <div className="mb-1 flex items-center gap-2 font-bold text-base">
              {lastScanMessage.type === "success" ? (
                <Icon name="checkCircle" size={20} className="shrink-0" />
              ) : null}
              <span>{lastScanMessage.studentName}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {!lastScanMessage.studentName && lastScanMessage.type === "success" ? (
              <Icon name="checkCircle" size={18} className="shrink-0" />
            ) : null}
            <span>{lastScanMessage.text}</span>
          </div>
        </div>
      )}

      {/* Manual Input Fallback */}
      <form onSubmit={handleManualSubmit} className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
        <label className="text-xs font-medium text-[var(--fg-muted)] block">
          {t("manualInput")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="kqr_v1...."
            className="flex-1 rounded-md border border-[var(--border-base)] bg-[var(--surface-sunken)] px-3 py-1.5 text-xs text-[var(--fg-base)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
            dir="ltr"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!manualCode.trim() || isSubmitting}>
            {t("search")}
          </Button>
        </div>
      </form>
    </div>
  );
}
