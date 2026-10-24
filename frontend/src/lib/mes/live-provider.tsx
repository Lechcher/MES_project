"use client";

/**
 * Live channel provider.
 *
 * Owns one `LiveController` per tab and runs its connection only while a
 * viewer is signed in: sign-out closes the socket, the next sign-in opens a
 * fresh one, and a stopped retry loop resumes when the tab regains focus.
 */

import { type ReactNode, useEffect, useState } from "react";
import { LiveContext, LiveController } from "./live";
import { useMesSession } from "./session";

export function MesLiveProvider({ children }: { children: ReactNode }) {
  const { viewer } = useMesSession();
  const [controller] = useState(() => new LiveController());

  // The connection exists only while someone is signed in.
  useEffect(() => {
    if (!viewer) {
      controller.close();
      return;
    }
    controller.ensureRunning();
    return () => controller.close();
  }, [controller, viewer]);

  // A stopped retry loop (repeated failures) resumes when the tab regains
  // focus — the cheap, reliable "try again now" moment for a dev server.
  useEffect(() => {
    const onFocus = () => {
      if (viewer) controller.ensureRunning();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [controller, viewer]);

  return (
    <LiveContext.Provider value={controller}>{children}</LiveContext.Provider>
  );
}
