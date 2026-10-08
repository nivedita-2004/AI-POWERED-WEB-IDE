import { useState, useEffect, useCallback, useRef } from "react";
import { WebContainer } from "@webcontainer/api";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

interface UseWebContainerProps {
  templateData: TemplateFolder;
}

interface UseWebContaierReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  destory: () => void;
}

// Module-level singleton state to ensure only one WebContainer instance exists
let activeInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let teardownPromise: Promise<void> | null = null;
let activeConsumers = 0;
let activeServerUrl: string | null = null;

// Track all instances that have been torn down or are currently tearing down
const tornDownInstances = new WeakSet<WebContainer>();

interface ScheduledTeardown {
  timer: ReturnType<typeof setTimeout>;
  targetInstance: WebContainer;
}
let pendingTeardown: ScheduledTeardown | null = null;

/**
 * Returns an existing, active WebContainer instance if available and not torn down.
 */
function getExistingWebContainer(): WebContainer | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (
    activeInstance &&
    !tornDownInstances.has(activeInstance) &&
    !(activeInstance as any)._tornDown
  ) {
    return activeInstance;
  }
  const apiInstance = (WebContainer as any)._instance as WebContainer | undefined;
  if (
    apiInstance &&
    !tornDownInstances.has(apiInstance) &&
    !(apiInstance as any)._tornDown
  ) {
    activeInstance = apiInstance;
    return apiInstance;
  }
  return null;
}

/**
 * Safely tears down a WebContainer instance.
 * Ensures teardown happens only once, prevents races with boot, and awaits completion.
 */
async function teardownWebContainer(
  targetInstance?: WebContainer | null
): Promise<void> {
  // 1. Prevent race with boot: if a boot is currently in progress, wait for it first
  if (bootPromise) {
    try {
      const booted = await bootPromise;
      if (!targetInstance) {
        targetInstance = booted;
      }
    } catch {
      activeInstance = null;
      bootPromise = null;
      activeServerUrl = null;
      return;
    }
  }

  const instanceToTeardown = targetInstance || activeInstance;

  // 2. Ensure teardown happens only once per instance
  if (
    !instanceToTeardown ||
    tornDownInstances.has(instanceToTeardown) ||
    (instanceToTeardown as any)._tornDown
  ) {
    if (activeInstance === instanceToTeardown) {
      activeInstance = null;
      activeServerUrl = null;
    }
    return;
  }

  // Mark immediately as torn down
  tornDownInstances.add(instanceToTeardown);
  if (activeInstance === instanceToTeardown) {
    activeInstance = null;
    activeServerUrl = null;
  }

  const runTeardown = async () => {
    try {
      instanceToTeardown.teardown();

      // Catch and handle internal teardown process abortion
      // (WebContainer aborts all running processes on teardown)
      const internalTeardownPromise = (WebContainer as any)._teardownPromise;
      if (
        internalTeardownPromise &&
        typeof internalTeardownPromise.catch === "function"
      ) {
        await internalTeardownPromise.catch((err: any) => {
          if (err?.message !== "Process aborted") {
            console.warn("WebContainer internal teardown notice:", err);
          }
        });
      }
    } catch (err: any) {
      if (
        err?.message !== "Process aborted" &&
        err?.message !== "WebContainer already torn down"
      ) {
        console.warn("Failed to teardown WebContainer:", err);
      }
    } finally {
      teardownPromise = null;
    }
  };

  teardownPromise = runTeardown();
  await teardownPromise;
}

/**
 * Gets or boots the singleton WebContainer instance.
 * Reuses existing instance, deduplicates concurrent boot calls,
 * and waits for any ongoing teardown to finish before booting.
 */
async function getWebContainer(): Promise<WebContainer> {
  if (typeof window === "undefined") {
    throw new Error("WebContainer can only be initialized in the browser.");
  }

  // Cancel any pending delayed teardown timer
  if (pendingTeardown) {
    clearTimeout(pendingTeardown.timer);
    pendingTeardown = null;
  }

  // If teardown is in progress, wait for it to complete before booting
  if (teardownPromise) {
    await teardownPromise;
  }
  const apiTeardown = (WebContainer as any)._teardownPromise;
  if (apiTeardown) {
    try {
      await apiTeardown;
    } catch {
      // Ignored
    }
  }

  // 1. Reuse existing instance if alive
  const existing = getExistingWebContainer();
  if (existing) {
    return existing;
  }

  // 2. Reuse ongoing boot promise to prevent race conditions
  if (bootPromise) {
    return bootPromise;
  }

  // 3. Boot new instance
  bootPromise = WebContainer.boot()
    .then((instance) => {
      activeInstance = instance;
      return instance;
    })
    .catch((err) => {
      // In case boot threw "Only a single WebContainer instance can be booted",
      // attempt recovery with the existing instance
      const fallback = getExistingWebContainer();
      if (fallback) {
        return fallback;
      }
      throw err;
    })
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

export const useWebContainer = ({
  templateData,
}: UseWebContainerProps): UseWebContaierReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(activeServerUrl);
  const [isLoading, setIsLoading] = useState<boolean>(!getExistingWebContainer());
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<WebContainer | null>(getExistingWebContainer());
  const instanceRef = useRef<WebContainer | null>(getExistingWebContainer());

  useEffect(() => {
    let mounted = true;
    activeConsumers++;

    // Cancel any pending teardown timer on mount
    if (pendingTeardown) {
      clearTimeout(pendingTeardown.timer);
      pendingTeardown = null;
    }

    async function initializeWebContainer() {
      try {
        const webcontainerInstance = await getWebContainer();

        instanceRef.current = webcontainerInstance;

        if (!mounted) return;

        setInstance(webcontainerInstance);
        setIsLoading(false);

        // Listen for server-ready events
        webcontainerInstance.on("server-ready", (port: number, url: string) => {
          activeServerUrl = url;
          if (mounted) {
            setServerUrl(url);
          }
        });
      } catch (err) {
        console.error("Failed to initialize WebContainer:", err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to initialize WebContainer"
          );
          setIsLoading(false);
        }
      }
    }

    initializeWebContainer();

    return () => {
      mounted = false;
      activeConsumers = Math.max(0, activeConsumers - 1);

      // Identify the exact instance this consumer was using
      const instanceToSchedule = instanceRef.current || activeInstance;

      // Only schedule delayed teardown if an actual non-torn-down instance exists
      // and all consumers have unmounted
      if (
        activeConsumers === 0 &&
        instanceToSchedule &&
        !tornDownInstances.has(instanceToSchedule) &&
        !(instanceToSchedule as any)._tornDown
      ) {
        if (pendingTeardown) {
          clearTimeout(pendingTeardown.timer);
        }

        const timer = setTimeout(async () => {
          pendingTeardown = null;
          // Verify that consumers are still 0, the instance was not replaced,
          // and the instance has not already been torn down
          if (
            activeConsumers === 0 &&
            instanceToSchedule === activeInstance &&
            !tornDownInstances.has(instanceToSchedule) &&
            !(instanceToSchedule as any)._tornDown
          ) {
            await teardownWebContainer(instanceToSchedule);
          }
        }, 2000);

        pendingTeardown = { timer, targetInstance: instanceToSchedule };
      }
    };
  }, []);

  const writeFileSync = useCallback(
    async (path: string, content: string): Promise<void> => {
      const currentInstance =
        instanceRef.current || instance || getExistingWebContainer();
      if (!currentInstance) {
        throw new Error("WebContainer instance is not available");
      }

      try {
        const pathParts = path.split("/");
        const folderPath = pathParts.slice(0, -1).join("/");

        if (folderPath) {
          await currentInstance.fs.mkdir(folderPath, { recursive: true });
        }

        await currentInstance.fs.writeFile(path, content);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to write file";
        console.error(`Failed to write file at ${path}:`, err);
        throw new Error(`Failed to write file at ${path}: ${errorMessage}`);
      }
    },
    [instance]
  );

  const destory = useCallback(() => {
    if (pendingTeardown) {
      clearTimeout(pendingTeardown.timer);
      pendingTeardown = null;
    }
    const currentInstance = instanceRef.current || getExistingWebContainer();
    instanceRef.current = null;
    setInstance(null);
    setServerUrl(null);
    activeServerUrl = null;
    if (currentInstance) {
      teardownWebContainer(currentInstance);
    }
  }, []);

  return { serverUrl, isLoading, error, instance, writeFileSync, destory };
};
