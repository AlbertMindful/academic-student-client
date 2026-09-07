"use client";

import * as React from "react";

export function PwaRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    let reloading = false;
    const reloadForUpdate = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);

    let cleanupUpdateListeners: (() => void) | undefined;
    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).then((registration) => {
      const checkForUpdate = () => void registration.update();
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") checkForUpdate();
      };
      checkForUpdate();
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", onVisibilityChange);
      cleanupUpdateListeners = () => {
        window.removeEventListener("focus", checkForUpdate);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdate);
      cleanupUpdateListeners?.();
    };
  }, []);

  return null;
}
