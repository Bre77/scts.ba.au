import type { StackState, StackSummary } from "../types";

export type AlertPermission = NotificationPermission | "unsupported";

/**
 * Stacks that were building last time we looked and have since come up or failed.
 * Stacks we've never seen are skipped, so a first load or a reload never alerts.
 */
export function finishedBuilds(
  before: ReadonlyMap<string, StackState>,
  after: readonly StackSummary[],
): StackSummary[] {
  return after.filter(
    (s) => (s.state === "RUNNING" || s.state === "ERROR") && before.get(s.id) === "CREATING",
  );
}

/** What to say about a build that just finished, for the notification and the toast. */
export function describeFinish(stack: StackSummary): { title: string; body: string } {
  return stack.state === "ERROR"
    ? {
        title: `${stack.name} failed to build`,
        body: "SCTS couldn't provision this stack. Delete it and create a new one.",
      }
    : {
        title: `${stack.name} is ready`,
        body: `Splunk ${stack.splunkVersion} is up. Open SCTS for the URL and credentials.`,
      };
}

export function alertPermission(): AlertPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Must be called from a click: browsers ignore or bury prompts that aren't. */
export async function askForAlerts(): Promise<AlertPermission> {
  if (alertPermission() !== "default") return alertPermission();
  try {
    return await Notification.requestPermission();
  } catch {
    return alertPermission();
  }
}

/** Show a system notification; clicking it brings this tab forward. */
export function alertFinished(stack: StackSummary): void {
  if (alertPermission() !== "granted") return;
  const { title, body } = describeFinish(stack);
  try {
    const note = new Notification(title, { body, tag: `scts-build-${stack.id}` });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker; the toast still shows.
  }
}
