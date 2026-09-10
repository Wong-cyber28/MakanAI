type AnalyticsProperties = Record<string, string | number | boolean>;

type AnalyticsClient = {
  capture: (event: string, properties?: AnalyticsProperties) => void;
  flush?: () => void | Promise<void>;
};

let client: AnalyticsClient | null = null;

export function bindAnalyticsClient(next: AnalyticsClient | null) {
  client = next;
}

export function captureEvent(event: string, properties?: AnalyticsProperties) {
  if (!client) {
    return;
  }
  client.capture(event, properties);
  void client.flush?.();
}
