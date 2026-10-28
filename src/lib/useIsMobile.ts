import { useSyncExternalStore } from "react";

// True on phone-sized screens. Renders as "not mobile" on the server, then corrects in the browser.
export function useIsMobile(max = 767) {
  const query = `(max-width:${max}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
