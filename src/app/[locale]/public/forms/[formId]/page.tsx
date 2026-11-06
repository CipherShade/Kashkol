"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

export default function PublicFormPage() {
  const params = useParams();
  const formId = params.formId as string;
  const t = useTranslations("forms");
  const [formData, setFormData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadForm() {
      try {
        const response = await fetch(`/api/forms/public/${formId}/submit`);
        if (!response.ok) throw new Error("Failed to load");
        const data = await response.json();
        setFormData(data.form);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadForm();
  }, [formId]);

  if (isLoading) return <div>{t("editor.loadFailed")}</div>;
  if (!formData) return <div>{t("loadFailed")}</div>;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">{formData.title}</h1>
      <p className="mb-6 text-gray-700">{formData.description}</p>
      {/* Implementation of form questions and submission would follow here */}
    </div>
  );
}
