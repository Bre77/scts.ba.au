import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}

/** A native <dialog>, so focus trapping and Escape come for free. */
export function Modal({ open, onClose, labelledBy, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} aria-labelledby={labelledBy} onCancel={onClose} onClose={onClose}>
      {open && children}
    </dialog>
  );
}
