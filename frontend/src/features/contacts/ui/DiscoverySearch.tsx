import { Search, Loader2, UserSearch } from "lucide-react";
import { useState, useEffect } from "react";
import { ContactUser } from "../types";
import { searchUsers } from "../api";
import { ContactCard } from "./ContactCard";
import { Input } from "@/shared/ui/FormControls";
import { useDebounce } from "../../../shared/hooks/useDebounce";
import { useAuthStore } from "@/modules/auth/state/authState";

export function DiscoverySearch() {
  const currentUserId = useAuthStore(state => state.user?.id?.toLowerCase() || "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 500);

  useEffect(() => {
    if (debouncedQuery.trim().length >= 3) {
      setLoading(true);
      searchUsers(debouncedQuery)
        .then((res) => {
          if (res.success) {
            setResults(res.data.filter(user => user.user_id?.toLowerCase() !== currentUserId));
          }
        })
        .finally(() => setLoading(false));
    } else {
      setResults([]);
    }
  }, [debouncedQuery, currentUserId]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserSearch className="text-primary" size={24} />
          Discovery
        </h2>
        <p className="text-muted-foreground text-sm font-medium">
          Find people by their username or email address.
        </p>
      </div>

      <div className="relative">
        <Input
          placeholder="Search by @username or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 h-14 rounded-2xl bg-muted/30 border-border focus:bg-background transition-all"
          icon={<Search size={20} className="text-muted-foreground/50" />}
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="animate-spin text-primary/40" size={20} />
          </div>
        )}
      </div>

      <div className="space-y-3">
        {results.length > 0 ? (
          results.map((user) => (
            <ContactCard 
                key={user.id} 
                user={user} 
                onActionComplete={() => {
                    // Refresh search to update status
                    searchUsers(debouncedQuery).then(res => {
                        if (res.success) {
                          setResults(res.data.filter(user => user.user_id?.toLowerCase() !== currentUserId));
                        }
                    });
                }} 
            />
          ))
        ) : query.trim().length >= 3 && !loading ? (
          <div className="py-12 text-center space-y-2 bg-muted/10 rounded-3xl border border-dashed border-border/50">
            <p className="text-sm font-bold text-muted-foreground">No users found</p>
            <p className="text-xs text-muted-foreground/60">Try a different username or exact email.</p>
          </div>
        ) : query.trim().length > 0 && query.trim().length < 3 ? (
             <p className="text-center text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest py-4">
                Type at least 3 characters to search
             </p>
        ) : (
          <div className="py-20 text-center flex flex-col items-center gap-4 opacity-20 grayscale">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Search size={40} className="text-primary" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest">Start typing to discover</p>
          </div>
        )}
      </div>
    </div>
  );
}
