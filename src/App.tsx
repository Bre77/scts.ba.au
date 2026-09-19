import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiKeyGate } from "./components/ApiKeyGate";
import { CreateStackDialog } from "./components/CreateStackDialog";
import { DeleteStackDialog } from "./components/DeleteStackDialog";
import { StackCard } from "./components/StackCard";
import { ApiError, api } from "./api";
import { keyStore } from "./lib/storage";
import { formatDurationLong, readLease } from "./lib/time";
import type { StackSummary } from "./types";

/** How often to re-check while a stack is still settling. */
const BUSY_POLL_MS = 15_000;
/** How often to advance the countdowns. */
const TICK_MS = 30_000;

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => keyStore.read());
  const [keyProblem, setKeyProblem] = useState("");
  const [stacks, setStacks] = useState<StackSummary[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [doomed, setDoomed] = useState<StackSummary | null>(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const toastTimer = useRef<number | undefined>(undefined);

  const announce = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /** Drop the stored key and return to the gate with a reason. */
  const rejectKey = useCallback((reason: string) => {
    keyStore.clear();
    setApiKey(null);
    setStacks(null);
    setKeyProblem(reason);
  }, []);

  const refresh = useCallback(
    async (key: string) => {
      setRefreshing(true);
      try {
        setStacks(await api.listStacks(key));
        setError("");
      } catch (cause) {
        if (cause instanceof ApiError && cause.isAuthFailure) {
          rejectKey(cause.message);
          return;
        }
        setError(cause instanceof Error ? cause.message : "Couldn't load your stacks.");
      } finally {
        setRefreshing(false);
      }
    },
    [rejectKey],
  );

  // Load on arrival and whenever the key changes.
  useEffect(() => {
    if (apiKey) void refresh(apiKey);
  }, [apiKey, refresh]);

  const settling = useMemo(
    () => (stacks ?? []).some((s) => s.state === "CREATING" || s.state === "STOPPING"),
    [stacks],
  );

  // Poll only while something is mid-flight, so idle tabs stay quiet.
  useEffect(() => {
    if (!apiKey || !settling) return;
    const id = window.setInterval(() => void refresh(apiKey), BUSY_POLL_MS);
    return () => window.clearInterval(id);
  }, [apiKey, settling, refresh]);

  // Keep the countdowns honest without re-fetching.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  async function acceptKey(candidate: string) {
    // Prove the key works before committing it, so the gate can report why not.
    await api.listStacks(candidate);
    keyStore.write(candidate);
    setKeyProblem("");
    setApiKey(candidate);
  }

  if (!apiKey) {
    return <ApiKeyGate problem={keyProblem} onSubmit={acceptKey} />;
  }

  const list = stacks ?? [];
  // The blank slate carries its own call to action, so don't repeat it up here.
  const blank = stacks !== null && list.length === 0 && error === "";
  const soonest = list
    .map((s) => readLease(s.createdAt, s.terminationDate, now).remainingMs)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)[0];

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <div className="wordmark">
            SCTS<span>Splunk Cloud Testing Service</span>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => void refresh(apiKey)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => rejectKey("")}>
            Forget my key
          </button>
        </div>
      </header>

      <main className="shell">
        <div className="intro">
          <div className="intro__text">
            <h1>{headline(stacks)}</h1>
            <p>{subhead(stacks, soonest)}</p>
          </div>
          {!blank && (
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              New stack
            </button>
          )}
        </div>

        {error && (
          <div className="notice" role="alert">
            <p>{error}</p>
            <button type="button" className="btn" onClick={() => void refresh(apiKey)}>
              Try again
            </button>
          </div>
        )}

        {blank && (
          <div className="blank">
            <h2>No stacks yet</h2>
            <p>Create one and SCTS will have a Splunk instance waiting in a few minutes.</p>
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              Create your first stack
            </button>
          </div>
        )}

        <div className="stacks">
          {list.map((stack) => (
            <StackCard
              key={stack.id}
              stack={stack}
              apiKey={apiKey}
              now={now}
              onDelete={setDoomed}
            />
          ))}
        </div>
      </main>

      <CreateStackDialog
        open={creating}
        apiKey={apiKey}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          announce(`Created ${name}. It'll be ready in a few minutes.`);
          void refresh(apiKey);
        }}
      />

      <DeleteStackDialog
        stack={doomed}
        apiKey={apiKey}
        onClose={() => setDoomed(null)}
        onDeleted={(name) => {
          setDoomed(null);
          announce(`Deleted ${name}.`);
          void refresh(apiKey);
        }}
      />

      <div role="status" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

function headline(stacks: StackSummary[] | null): string {
  if (stacks === null) return "Loading your stacks";
  const count = stacks.length;
  if (count === 0) return "Nothing running";
  const busy = stacks.filter((s) => s.state === "CREATING").length;
  if (busy === count) return count === 1 ? "One stack building" : `${count} stacks building`;
  return count === 1 ? "One stack" : `${count} stacks`;
}

function subhead(stacks: StackSummary[] | null, soonest: number | undefined): string {
  if (stacks === null) return "Fetching what you have running right now.";
  if (stacks.length === 0) {
    return "SCTS stacks are short-lived: they terminate on their own, so there's nothing to clean up.";
  }
  if (soonest === undefined) return "Everything here has reached its termination time.";
  const which = stacks.length === 1 ? "It expires" : "The next one expires";
  return `${which} in ${formatDurationLong(soonest)}.`;
}
