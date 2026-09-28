import type { StackState, StackSummary } from "../types";

export type AlertPermission = NotificationPermission | "unsupported";

/**
 * Stacks that were building last time we looked and are running now.
 * Stacks we've never seen are skipped, so a first load or a reload never alerts.
 */
export function newlyReady(
  before: ReadonlyMap<string, StackState>,
  after: readonly StackSummary[],
): StackSummary[] {
  return after.filter((s) => s.state === "RUNNING" && before.get(s.id) === "CREATING");
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
export function alertReady(stack: StackSummary): void {
  if (alertPermission() !== "granted") return;
  try {
    const note = new Notification(`${stack.name} is ready`, {
      body: `Splunk ${stack.splunkVersion} is up. Open SCTS for the URL and credentials.`,
      tag: `scts-ready-${stack.id}`,
    });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker; the toast still shows.
  }
}
