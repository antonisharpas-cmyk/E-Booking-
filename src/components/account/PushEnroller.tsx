"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";

/**
 * Turning push notifications on, for this device.
 *
 * The studio's side of push is always on and there is no switch to turn it off.
 * This is the other side: the browser's permission, which we cannot grant on
 * anybody's behalf and cannot take back. Each device is separate — a member's
 * phone and their laptop are two grants — so this reports on the device in front
 * of them rather than pretending there is one global setting.
 *
 * The states it has to be honest about:
 *   unsupported   an old browser, or an iPhone that has not added the site to
 *                 the Home Screen — Safari does not offer push until it has
 *   default       never asked; the button asks
 *   granted       subscribed, and it says which device count is live
 *   denied        the member said no, and only they can undo that in browser
 *                 settings. We cannot re-prompt, and saying "click allow" when
 *                 no prompt will appear is the most annoying thing an app does.
 */
export function PushEnroller({ publicKey }: { publicKey: string }) {
  const { t } = useI18n();
  const p = t.profile;

  const [state, setState] = useState<
    "checking" | "unsupported" | "default" | "granted" | "denied" | "busy"
  >("checking");
  const [devices, setDevices] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !publicKey
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "granted" : "default");
    } catch {
      setState("default");
    }
    try {
      const res = await fetch("/api/push/subscribe");
      if (res.ok) {
        const data = (await res.json()) as { devices?: number };
        setDevices(data.devices ?? 0);
      }
    } catch {
      /* The count is a nicety; its absence is not worth a message. */
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const raw = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          p256dh: raw.keys?.p256dh,
          auth: raw.keys?.auth,
        }),
      });
      if (!res.ok) {
        setError(t.common.somethingWrong);
        setState("default");
        return;
      }
      await refresh();
      setState("granted");
    } catch (e) {
      setError((e as Error).message);
      setState("default");
    }
  }

  /* Nothing at all while we do not know yet, and nothing on a browser that
     cannot do this: an explanation of somebody else's browser is not something
     they can act on, and it was the longest thing on the screen. */
  if (state === "checking" || state === "unsupported") return null;

  const line =
    state === "granted"
      ? devices > 1
        ? p.pushOnDevices.replace("{n}", String(devices))
        : p.pushOnThisDevice
      : state === "denied"
        ? p.pushBlocked
        : p.pushOffThisDevice;

  return (
    <div className="mt-4 rounded-2xl border border-mocha-200/70 bg-cream-200/40 p-4">
      <p className="text-[12px] leading-relaxed text-mocha-600">{line}</p>

      {(state === "default" || state === "busy") && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={state === "busy"}
          onClick={enable}
        >
          {state === "busy" ? t.common.loading : p.pushEnable}
        </Button>
      )}

      {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}
    </div>
  );
}

/** The VAPID key travels as base64url and the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
