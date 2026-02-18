type MetricName =
  | 'tasks_run'
  | 'tasks_failed'
  | 'tasks_skipped'
  | 'new_businesses'
  | 'new_sources';

const counters: Record<MetricName, number> = {
  tasks_run: 0,
  tasks_failed: 0,
  tasks_skipped: 0,
  new_businesses: 0,
  new_sources: 0,
};

export function incrementMetric(metric: MetricName, by = 1): void {
  counters[metric] += by;
}

export function getMetricSnapshot(): Record<MetricName, number> {
  return { ...counters };
}

export function logDiscoveryEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
      metrics: getMetricSnapshot(),
    }),
  );
}
