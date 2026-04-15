import { formatRelativeTime } from "@/shared/lib/date";
import { SessionInfo } from "@/features/auth/types";

type SessionListProps = {
  sessions: SessionInfo[];
  onRevoke: (sessionId: string) => void;
  disabled?: boolean;
  allowCurrentRevoke?: boolean;
};

export function SessionList({
  sessions,
  onRevoke,
  disabled = false,
  allowCurrentRevoke = false,
}: SessionListProps) {
  if (!sessions.length) {
    return <p>No active sessions found.</p>;
  }

  return (
    <div className="stack">
      {sessions.map((session) => (
        <div key={session.session_id} className="card">
          <div className="session-info">
            <p className="device-label"><strong>Device:</strong> {session.device}</p>
            {(session.city || session.country_code) && (
              <p className="location-label text-muted">
                <strong>Location:</strong> {[session.city, session.country_code].filter(Boolean).join(", ")}
              </p>
            )}
            <p className="time-label"><strong>Last seen:</strong> {formatRelativeTime(session.last_seen_at)}</p>
            <p className="current-label"><strong>Current:</strong> {session.is_current ? "Yes" : "No"}</p>
          </div>
          <button
            className="secondary"
            onClick={() => onRevoke(session.session_id)}
            disabled={disabled || (session.is_current && !allowCurrentRevoke)}
            type="button"
          >
            Revoke this session
          </button>
        </div>
      ))}
    </div>
  );
}
