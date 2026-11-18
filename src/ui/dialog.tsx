import { useEffect, useRef } from "react";
import { create } from "zustand";

/**
 * In-page replacements for confirm() and alert(). Some browsers (including embedded browser
 * panes) block native dialogs, and then confirm() silently answers "no".
 */
interface Dialog {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string | null; // null: a notice with just an OK button
  danger: boolean;
  resolve: (ok: boolean) => void;
}

const useDialog = create<{ dialog: Dialog | null }>(() => ({ dialog: null }));

function open(d: Omit<Dialog, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.getState().dialog?.resolve(false); // only one at a time
    useDialog.setState({ dialog: { ...d, resolve } });
  });
}

/** Ask before doing something; resolves true if confirmed. */
export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return open({ message: "", confirmLabel: "OK", danger: false, cancelLabel: "Cancel", ...opts });
}

/** Tell the user something (e.g. an error) with an OK button. */
export function notify(title: string, message = ""): Promise<boolean> {
  return open({ title, message, confirmLabel: "OK", cancelLabel: null, danger: false });
}

/** Renders the open dialog, if any. Mount once at the app root. */
export function DialogHost() {
  const dialog = useDialog((s) => s.dialog);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const close = (ok: boolean) => {
    dialog?.resolve(ok);
    useDialog.setState({ dialog: null });
  };

  useEffect(() => {
    if (!dialog) return;
    // For destructive actions, start on Cancel so a stray Enter doesn't delete anything.
    (dialog.danger && cancelRef.current ? cancelRef.current : confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!dialog) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">
        <h2 id="dialog-title">{dialog.title}</h2>
        {dialog.message && <p id="dialog-message">{dialog.message}</p>}
        <div className="dialog-actions">
          {dialog.cancelLabel && <button ref={cancelRef} onClick={() => close(false)}>{dialog.cancelLabel}</button>}
          <button ref={confirmRef} className={dialog.danger ? "danger-solid" : "primary"} onClick={() => close(true)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
