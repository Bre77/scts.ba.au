import { useState, type FormEvent } from "react";

interface Props {
  /** Set when a previously stored key stopped working. */
  problem?: string;
  onSubmit: (apiKey: string) => Promise<void>;
}

export function ApiKeyGate({ problem, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(problem ?? "");
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const apiKey = value.trim();
    if (apiKey.length === 0) {
      setError("Paste your key to continue.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      await onSubmit(apiKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That key didn't work.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="gate">
      <div className="gate__card">
        <h1>Splunk Cloud Testing Service</h1>
        <p>
          Spin up a short-lived Splunk stack, grab its URL and credentials, and let it expire on
          its own.
        </p>

        <form onSubmit={submit}>
          <div className="label-row">
            <label htmlFor="api-key" className="hint">
              Dev Portal API key
            </label>
            <a
              className="hint"
              href="https://dev.splunk.com/developer-program/keys/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Get a key
            </a>
          </div>
          <input
            id="api-key"
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your key"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby="key-note"
            aria-invalid={error.length > 0}
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={checking}>
            {checking ? "Checking key" : "Continue"}
          </button>
          <p id="key-note" className="hint">
            The key stays in this browser and is sent with each request to SCTS. Nothing is stored
            on the server.
          </p>
        </form>
      </div>
    </main>
  );
}
