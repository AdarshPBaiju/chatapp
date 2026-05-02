import { UserCheck, Clock, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ContactUser } from "../types";
import { fetchContacts } from "../api";
import { ContactCard } from "./ContactCard";

export function RequestsPage() {
  const [requests, setRequests] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await fetchContacts("pending");
      if (res.success) setRequests(res.data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="animate-spin text-primary/40" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Clock className="text-primary" size={24} />
          Friend Requests
        </h2>
        <p className="text-muted-foreground text-sm font-medium">
          Manage incoming requests from users who want to connect with you.
        </p>
      </div>

      <div className="space-y-4">
        {requests.length > 0 ? (
          <div className="grid gap-3">
             <span className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2 block">
                Incoming ({requests.length})
             </span>
             {requests.map((user) => (
                <ContactCard 
                    key={user.id} 
                    user={user} 
                    onActionComplete={loadRequests} 
                />
             ))}
          </div>
        ) : (
          <div className="py-20 text-center flex flex-col items-center gap-4 bg-muted/10 rounded-3xl border border-dashed border-border/50">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground/30">
                <UserCheck size={32} />
            </div>
            <div className="space-y-1">
                <p className="text-sm font-bold text-muted-foreground">No pending requests</p>
                <p className="text-xs text-muted-foreground/60">When someone adds you, it'll show up here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
