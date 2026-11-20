import webpush from "web-push";
import type { PushSender, PushPayload, PushTarget } from "../core/dispatch";
import { pushConfigured } from "./env";

/** Mock sender used when no VAPID keys are set: pretends the push service accepted the message. Nothing reaches a device. */
class MockSender implements PushSender {
  async send(): Promise<{ status: number }> {
    return { status: 201 };
  }
}

class WebPushSender implements PushSender {
  constructor() {
    webpush.setVapidDetails(process.env.WEB_PUSH_CONTACT || "mailto:admin@example.com", process.env.WEB_PUSH_VAPID_PUBLIC_KEY!, process.env.WEB_PUSH_VAPID_PRIVATE_KEY!);
  }
  async send(target: PushTarget, payload: PushPayload): Promise<{ status: number }> {
    try {
      const r = await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "normal" });
      return { status: r.statusCode };
    } catch (e) {
      return { status: (e as { statusCode?: number }).statusCode ?? 0 };
    }
  }
}

export function getSender(): PushSender {
  return pushConfigured() ? new WebPushSender() : new MockSender();
}
