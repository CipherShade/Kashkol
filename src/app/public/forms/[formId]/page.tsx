"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface FormState {
  title: string;
  description: string;
  submissionMode: string;
  isPublic: boolean;
  acceptingResponses: boolean;
  confirmationMessage: string | null;
  status: string;
  sections: Array<{
    id: string;
    title: string;
    description: string | null;
    pageBreakBefore: boolean;
    questions: Array<{
      id: string;
      sectionId: string | null;
      orderIndex: number;
      questionType: string;
      prompt: string;
      description: string | null;
      isRequired: boolean;
      configJson: Record<string, unknown>;
      options: Array<{
        id: string;
        label: string;
        orderIndex: number;
      }>;
    }>;
  }>;
  logicRules: Array<{
    id: string;
    sourceQuestionId: string;
    operator: string;
    comparisonJson: Record<string, unknown> | null;
    action: string;
    targetQuestionId: string | null;
    targetSectionId: string | null;
  }>;
  answers: Answer[];
}

interface Answer {
  questionId: string;
  value: Record<string, unknown>;
}

interface SubmitInput {
  studentId: string | null;
  submittedByUserId: string | null;
  answers: Answer[];
}

export default function PublicFormPage() {
  const [formData, setFormData] = useState<FormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function loadForm() {
      const formId = window.location.pathname.split("/").filter(Boolean).pop();
      if (!formId) {
        setError("Missing form ID");
        setIsLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/forms/public/${formId}/submit`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          if (response.status === 404) setError("Form not found");
          else if (response.status === 403) setError("Form is not available");
          else setError("Failed to load form");
          setIsLoading(false);
          return;
        }
        const data = await response.json();
        if (!cancelled && data.form) {
          setFormData(data.form);
          setError(null);
        }
      } catch {
        setError("Failed to load form");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadForm();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (formData && (formData.status === "archived" || !formData.acceptingResponses)) {
      router.push("/public/forms");
    }
  }, [formData, router]);

  const handleSubmit = async (answers: Answer[]) => {
    const formId = window.location.pathname.split("/").filter(Boolean).pop();
    if (!formId) return;
    setSubmissionStatus("submitting");
    setSubmissionError(null);
    try {
      const input: SubmitInput = { studentId: null, submittedByUserId: null, answers };
      const response = await fetch(`/api/forms/public/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("Submission failed");
      setSubmissionStatus("success");
    } catch (err) {
      setSubmissionStatus("error");
      setSubmissionError(err instanceof Error ? err.message : "Submission failed");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 border-2 border-blue-500 border-t-4 rounded-full animate-spin" />
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <h2 className="text-red-600 font-bold mb-2">Error</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-8">No form data</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">{formData.title}</h1>
      {formData.description && <p className="text-gray-700 mb-6">{formData.description}</p>}
      <div className="mb-6 bg-gray-100 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full" style={{ width: "100%" }} />
      </div>
      <div className="space-y-6">
        {formData.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="border border-gray-200 rounded-lg p-6 bg-white">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{section.title}</h2>
            {section.description && <p className="text-gray-600 mb-4">{section.description}</p>}
            <div className="space-y-4">
              {section.questions.map((question, questionIndex) => (
                <div key={questionIndex} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-gray-600">{questionIndex + 1}. {question.prompt}</span>
                    {question.isRequired && <span className="text-red-500 text-sm font-bold" aria-label="Required">*</span>}
                  </div>
                  {question.description && <p className="text-sm text-gray-500 mb-3">{question.description}</p>}
                  <input type="text" placeholder="Your answer"
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submissionStatus === "submitting"} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="text-center">
          <button type="button" onClick={() => {
            const answers: Answer[] = formData.sections.flatMap((s) => s.questions.map((q) => ({ questionId: q.id, value: { text: "" } })));
            handleSubmit(answers);
          }}
            disabled={submissionStatus === "submitting"}
            className={`px-8 py-3 rounded-md font-medium transition-colors ${submissionStatus === "submitting" ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
            {submissionStatus === "submitting" ? "Submitting..." : "Submit"}
          </button>
          {submissionError && <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4"><h3 className="text-red-600 font-semibold mb-2">Submission Error</h3><p className="text-red-700">{submissionError}</p></div>}
        </div>
      </div>
    </div>
  );
}
