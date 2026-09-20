import { useEffect, useState } from "react";
import { Field } from "./Field";
import { api } from "../api";
import { formatDuration, formatMoment, readLease } from "../lib/time";
import type { StackAccessDetails, StackState, StackSummary } from "../types";

const STATE_WORDS: Record<StackState, string> = {
  CREATING: "Creating",
  RUNNING: "Running",
  STOPPING: "Stopping",
  ERROR: "Error",
};

interface Props {
  stack: StackSummary;
  apiKey: string;
  now: number;
  onDelete: (stack: StackSummary) => void;
}

export function StackCard({ stack, apiKey, now, onDelete }: Props) {
  const [access, setAccess] = useState<StackAccessDetails | null>(null);
  const lease = readLease(stack.createdAt, stack.terminationDate, now);

  // Credentials only exist once the stack is up, so ask for them then.
  useEffect(() => {
    if (stack.state !== "RUNNING" || access !== null) return;

    let cancelled = false;
    api
      .getStack(apiKey, stack.id)
      .then((detail) => {
        if (!cancelled && detail.stackAccessDetails) setAccess(detail.stackAccessDetails);
      })
      .catch(() => {
        // The card is still useful without credentials; the list view keeps working.
      });

    return () => {
      cancelled = true;
    };
  }, [stack.state, stack.id, apiKey, access]);

  const busy = stack.state === "CREATING" || stack.state === "STOPPING";
  const spentPercent = Math.round(lease.spent * 100);

  return (
    <article className="stack" data-state={stack.state} data-ending={lease.endingSoon}>
      <div className="stack__head">
        <h2 className="stack__name">{stack.name}</h2>
        <span className={busy ? "state state--busy" : "state"} data-state={stack.state}>
          {STATE_WORDS[stack.state]}
        </span>
        <button type="button" className="btn btn--quiet" onClick={() => onDelete(stack)}>
          Delete
          <span className="sr-only"> {stack.name}</span>
        </button>
      </div>

      <div className="stack__facts">
        <span>
          Splunk <b className="mono">{stack.splunkVersion}</b>
        </span>
        <span>
          Created <b>{formatMoment(stack.createdAt)}</b>
        </span>
        <span className="mono">{stack.id}</span>
      </div>

      <figure
        className="lease"
        data-ending={lease.endingSoon}
        role="group"
        aria-label={`Lease: ${formatDuration(lease.remainingMs)} left of this stack's life`}
      >
        <div className="lease__track">
          <div className="lease__spent" style={{ width: `${spentPercent}%` }} />
        </div>
        <figcaption className="lease__legend">
          <span>
            {lease.remainingMs > 0 ? (
              <>
                Expires in <b>{formatDuration(lease.remainingMs)}</b>
              </>
            ) : (
              <b>Expired</b>
            )}
          </span>
          <span>{formatMoment(stack.terminationDate)}</span>
        </figcaption>
      </figure>

      {stack.state === "RUNNING" && access && (
        <div className="access">
          <Field label="Splunk web" value={access.url} href={access.url} />
          <Field label="Username" value={access.username} />
          <Field label="Password" value={access.password} secret />
        </div>
      )}

      {stack.state === "CREATING" && (
        <p className="access hint">
          Building for {formatDuration(now - new Date(stack.createdAt).getTime())}. Credentials
          appear here once SCTS finishes provisioning; this page checks every fifteen seconds.
        </p>
      )}

      {stack.state === "ERROR" && (
        <p className="access hint">
          SCTS couldn't provision this stack. Delete it and create a new one; if it keeps failing,
          tell the SCTS team.
        </p>
      )}
    </article>
  );
}
