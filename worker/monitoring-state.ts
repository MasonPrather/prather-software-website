export type ContactIncident = 'delivery' | 'verification';
export interface MonitoringEnvironment {
  MONITORING_STATE?: Pick<KVNamespace, 'get' | 'put' | 'delete'>;
}
type BackgroundContext = Pick<ExecutionContext, 'waitUntil'>;
const keys: Record<ContactIncident, string> = {
  delivery: 'contact:delivery',
  verification: 'contact:verification',
};

function unavailable(operation: 'read' | 'write' | 'clear'): void {
  try {
    console.warn(
      JSON.stringify({
        event: 'contact_monitoring_state_unavailable',
        operation,
      }),
    );
  } catch {
    // Monitoring must not affect an inquiry's verified acceptance result.
  }
}

/** Stores fixed incident metadata only, never the failed inquiry or provider data. */
export async function updateContactIncident(
  env: MonitoringEnvironment,
  category: ContactIncident,
  active: boolean,
  context?: BackgroundContext,
): Promise<void> {
  if (!env.MONITORING_STATE) return;
  const update = (async () => {
    try {
      if (active) {
        await env.MONITORING_STATE!.put(
          keys[category],
          JSON.stringify({ category, at: Date.now() }),
        );
      } else {
        await env.MONITORING_STATE!.delete(keys[category]);
      }
    } catch {
      unavailable(active ? 'write' : 'clear');
    }
  })();
  if (context) {
    // Actual requests keep their response deadline; the runtime owns this work.
    try {
      context.waitUntil(update);
      return;
    } catch {
      unavailable(active ? 'write' : 'clear');
    }
  }
  await update;
}

/** A marker remains until a later verified success clears its own category. */
export async function monitoringStateHealthy(
  env: MonitoringEnvironment,
): Promise<boolean> {
  if (!env.MONITORING_STATE) return false;
  try {
    const markers = await Promise.all([
      env.MONITORING_STATE.get(keys.delivery),
      env.MONITORING_STATE.get(keys.verification),
    ]);
    return markers.every((marker) => marker === null);
  } catch {
    unavailable('read');
    return false;
  }
}
