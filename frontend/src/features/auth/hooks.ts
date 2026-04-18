import { useCallback } from "react";

/**
 * useJitterSubmit
 * 
 * Generates a random human-reflex delay (85ms - 320ms) before executing 
 * a callback. This disrupts high-frequency automated bots by breaking 
 * predictable submission timing.
 */
export function useJitterSubmit(callback: () => void | Promise<void>) {
  return useCallback(async () => {
    // Generate a random delay between 85ms and 320ms
    const jitter = Math.floor(Math.random() * (320 - 85 + 1) + 85);
    
    await new Promise((resolve) => setTimeout(resolve, jitter));
    return callback();
  }, [callback]);
}
