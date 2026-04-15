let inflight: Promise<unknown> | null = null;

export async function runSingleFlightRefresh<T>(
  refreshTask: () => Promise<T>,
): Promise<T> {
  if (inflight) {
    return inflight as Promise<T>;
  }

  inflight = refreshTask().finally(() => {
    inflight = null;
  });

  return inflight as Promise<T>;
}
