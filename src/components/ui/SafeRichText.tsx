"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

function stripInlineStyles(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  const stripAttributes = (element: Element) => {
    element.removeAttribute("style");
    element.removeAttribute("bgcolor");
    element.removeAttribute("color");
    element.removeAttribute("face");
    element.removeAttribute("align");
    element.removeAttribute("width");
    element.removeAttribute("height");
    element.removeAttribute("border");
    element.removeAttribute("cellpadding");
    element.removeAttribute("cellspacing");
    element.removeAttribute("valign");
    element.removeAttribute("bg");

    Array.from(element.children).forEach((child) => stripAttributes(child));
  };

  document.body.querySelectorAll("*").forEach((element) => {
    stripAttributes(element);
  });

  return document.body.innerHTML;
}

interface SafeRichTextProps {
  html: string;
  className?: string;
}

export default function SafeRichText({ html, className }: SafeRichTextProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cleaned = stripInlineStyles(html || "");
    const safeHtml = DOMPurify.sanitize(cleaned, {
      USE_PROFILES: { html: true },
    });

    setSanitizedHtml(safeHtml);
  }, [html]);

  if (!sanitizedHtml) {
    return null;
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert text-slate-700 dark:text-slate-300 prose-strong:text-slate-900 dark:prose-strong:text-slate-50 prose-strong:font-semibold prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-a:text-teal-600 dark:prose-a:text-teal-400 prose-a:no-underline prose-a:underline-offset-4 prose-headings:text-slate-900 dark:prose-headings:text-slate-50",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
