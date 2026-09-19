import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  label: string;
}

/** Copies a machine value and says so, then quietly goes back to resting. */
export function CopyButton({ value, label }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; the value is on screen and selectable anyway.
    }
  }

  return (
    <button type="button" className="btn btn--quiet" onClick={copy}>
      {copied ? "Copied" : "Copy"}
      <span className="sr-only"> {label}</span>
    </button>
  );
}
