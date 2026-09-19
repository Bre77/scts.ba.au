import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";
import type { StackSummary } from "../types";

interface Props {
  stack: StackSummary | null;
  apiKey: string;
  onClose: () => void;
  onDeleted: (name: string) => void;
}

export function DeleteStackDialog({ stack, apiKey, onClose, onDeleted }: Props) {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (stack) setError("");
  }, [stack]);

  async function remove() {
    if (!stack) return;
    setDeleting(true);
    setError("");
    try {
      await api.deleteStack(apiKey, stack.id);
      onDeleted(stack.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't delete the stack.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={stack !== null} onClose={onClose} labelledBy="delete-title">
      <div className="modal">
        <h2 id="delete-title">Delete {stack?.name}?</h2>
        <p>The stack and everything indexed on it go away. This can't be undone.</p>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose} disabled={deleting}>
            Keep it
          </button>
          <button type="button" className="btn btn--danger" onClick={remove} disabled={deleting}>
            {deleting ? "Deleting stack" : "Delete stack"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
