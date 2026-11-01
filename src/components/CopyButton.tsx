"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label}: ${text}`}
      className={`flex-none cursor-pointer text-[13px] transition-colors ${className}`}
    >
      <span aria-live="polite">{state === "ok" ? "Copied ✓" : state === "fail" ? "Press Ctrl+C" : label}</span>
    </button>
  );
}
