import { useId, useState } from "react";
import { CopyButton } from "./CopyButton";

interface Props {
  label: string;
  value: string;
  /** Renders as a link out to the stack. */
  href?: string;
  /** Hides the value until the person asks to see it. */
  secret?: boolean;
}

export function Field({ label, value, href, secret = false }: Props) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const hidden = secret && !revealed;

  return (
    <div className="field">
      <span className="field__label" id={id}>
        {label}
      </span>
      <span className="field__value mono" aria-labelledby={id}>
        {hidden ? (
          "••••••••••••"
        ) : href ? (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {value}
          </a>
        ) : (
          value
        )}
      </span>
      <span style={{ display: "flex", gap: "0.15rem" }}>
        {secret && (
          <button type="button" className="btn btn--quiet" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Show"}
            <span className="sr-only"> {label}</span>
          </button>
        )}
        <CopyButton value={value} label={label} />
      </span>
    </div>
  );
}
