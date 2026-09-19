const KEY = "scts.apiKey";

/** The API key lives only in this browser and is sent with each request. */
export const keyStore = {
  read(): string | null {
    try {
      const value = localStorage.getItem(KEY);
      return value && value.length > 0 ? value : null;
    } catch {
      return null; // Private mode or blocked storage.
    }
  },

  write(value: string): void {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Not persisting is survivable; the key stays in memory for this session.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to do.
    }
  },
};
