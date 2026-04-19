export function formatRelativeTime(timestampSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestampSeconds;

  if (diff < 30) return "Just now";
  if (diff < 60) return `${diff} sec ago`;
  
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} min${mins > 1 ? "s" : ""} ago`;
  }
  
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  return new Date(timestampSeconds * 1000).toLocaleDateString();
}
