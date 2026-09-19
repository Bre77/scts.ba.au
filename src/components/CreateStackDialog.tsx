import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";
import type { SplunkVersion } from "../types";

interface Props {
  open: boolean;
  apiKey: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}

/** Sentinel for "let SCTS pick the latest released version". */
const DEFAULT = "";

export function CreateStackDialog({ open, apiKey, onClose, onCreated }: Props) {
  const [versions, setVersions] = useState<SplunkVersion[] | null>(null);
  const [choice, setChoice] = useState(DEFAULT);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setChoice(DEFAULT);

    let cancelled = false;
    api
      .listVersions(apiKey)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch(() => {
        // The default version still works without the list, so fall back quietly.
        if (!cancelled) setVersions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, apiKey]);

  async function create() {
    setCreating(true);
    setError("");
    try {
      const stack = await api.createStack(apiKey, choice === DEFAULT ? {} : { splunkVersion: choice });
      onCreated(stack.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create the stack.");
    } finally {
      setCreating(false);
    }
  }

  const released = versions?.filter((v) => v.status === "released") ?? [];
  const unreleased = versions?.filter((v) => v.status === "unreleased") ?? [];

  return (
    <Modal open={open} onClose={onClose} labelledBy="create-title">
      <div className="modal">
        <h2 id="create-title">Create a stack</h2>
        <p>
          SCTS provisions it in the background. It usually takes a few minutes before you can log
          in.
        </p>

        <label>
          Splunk version
          <select
            className="select"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            disabled={creating}
          >
            <option value={DEFAULT}>Latest released</option>
            {released.length > 0 && (
              <optgroup label="Released">
                {released.map((v) => (
                  <option key={v.buildVersion} value={v.buildVersion}>
                    {v.buildVersion} ({v.releaseName})
                  </option>
                ))}
              </optgroup>
            )}
            {unreleased.length > 0 && (
              <optgroup label="Not yet released">
                {unreleased.map((v) => (
                  <option key={v.buildVersion} value={v.buildVersion}>
                    {v.buildVersion} ({v.releaseName})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={create} disabled={creating}>
            {creating ? "Creating stack" : "Create stack"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
