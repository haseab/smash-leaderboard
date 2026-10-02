// Acknowledge only successfully loaded versions. Reading the version before
// refreshing means a change during the refresh is detected on the next tick.
export function createVersionPoller(options: {
  isActive: () => boolean;
  readVersion: () => Promise<string>;
  refresh: () => Promise<boolean>;
  onError: (error: unknown) => void;
}) {
  let loadedVersion: string | null = null;
  let inFlight = false;
  let stopped = false;

  return {
    async poll() {
      if (stopped || inFlight || !options.isActive()) return;
      inFlight = true;
      try {
        const version = await options.readVersion();
        if (stopped || !options.isActive() || version === loadedVersion) return;
        if (await options.refresh()) loadedVersion = version;
      } catch (error) {
        if (!stopped) options.onError(error);
      } finally {
        inFlight = false;
      }
    },
    stop() {
      stopped = true;
    },
  };
}
