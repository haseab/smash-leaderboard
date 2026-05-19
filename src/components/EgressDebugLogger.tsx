"use client";

import { useEffect } from "react";

type ResourceBucket = {
  count: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};

const DEBUG_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_DEBUG_EGRESS === "1";

const TRACKED_PATH_PATTERNS = [
  "/api/",
  "/images/",
  "/storage/v1/object/",
  "/storage/v1/render/",
];

const FLUSH_INTERVAL_MS = 5000;

const isTrackedResource = (entry: PerformanceResourceTiming) => {
  const url = new URL(entry.name);
  return TRACKED_PATH_PATTERNS.some((pattern) => url.pathname.includes(pattern));
};

const getResourceKey = (entry: PerformanceResourceTiming) => {
  const url = new URL(entry.name);
  const path =
    url.pathname.startsWith("/api/") && url.search
      ? `${url.pathname}${url.search}`
      : url.pathname;

  return `${entry.initiatorType || "resource"} ${url.origin}${path}`;
};

export default function EgressDebugLogger() {
  useEffect(() => {
    if (!DEBUG_ENABLED || typeof PerformanceObserver === "undefined") {
      return;
    }

    const pendingEntries: PerformanceResourceTiming[] = [];

    const enqueueEntries = (entries: PerformanceEntryList) => {
      for (const entry of entries) {
        if (entry.entryType !== "resource") {
          continue;
        }

        const resourceEntry = entry as PerformanceResourceTiming;
        try {
          if (isTrackedResource(resourceEntry)) {
            pendingEntries.push(resourceEntry);
          }
        } catch {
          // Ignore malformed extension or browser-internal resource URLs.
        }
      }
    };

    enqueueEntries(performance.getEntriesByType("resource"));

    const observer = new PerformanceObserver((list) => {
      enqueueEntries(list.getEntries());
    });

    observer.observe({ entryTypes: ["resource"] });

    const flushEntries = () => {
      if (pendingEntries.length === 0) {
        return;
      }

      const buckets = new Map<string, ResourceBucket>();

      for (const entry of pendingEntries.splice(0)) {
        const key = getResourceKey(entry);
        const bucket = buckets.get(key) || {
          count: 0,
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
        };

        bucket.count += 1;
        bucket.transferSize += entry.transferSize || 0;
        bucket.encodedBodySize += entry.encodedBodySize || 0;
        bucket.decodedBodySize += entry.decodedBodySize || 0;
        buckets.set(key, bucket);
      }

      const rows = Array.from(buckets.entries())
        .map(([resource, bucket]) => ({
          resource,
          count: bucket.count,
          transferKb: Number((bucket.transferSize / 1024).toFixed(1)),
          encodedKb: Number((bucket.encodedBodySize / 1024).toFixed(1)),
          decodedKb: Number((bucket.decodedBodySize / 1024).toFixed(1)),
        }))
        .sort((a, b) => b.transferKb - a.transferKb || b.encodedKb - a.encodedKb);

      console.log(`[browser-egress] resource transfer summary (${FLUSH_INTERVAL_MS}ms)`);
      console.log(`[browser-egress-data] ${JSON.stringify(rows)}`);
      console.table(rows);
    };

    const intervalId = window.setInterval(flushEntries, FLUSH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      observer.disconnect();
      flushEntries();
    };
  }, []);

  return null;
}
