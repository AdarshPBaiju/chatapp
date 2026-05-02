import { Users, Search, Plus, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ContactUser } from "../types";
import { fetchContacts } from "../api";
import { ContactCard } from "./ContactCard";
import { Button, Input } from "@/shared/ui/FormControls";
import { useNavigate } from "react-router-dom";

export function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    setLoading(true);
    try {
      const res = await fetchContacts("accepted");
      if (res.success) setContacts(res.data);
    } finally {
      setLoading(false);
    }
  }

  const filteredContacts = contacts.filter(c => 
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.nickname && c.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="animate-spin text-primary/40" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="text-primary" size={24} />
            Contacts
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            Your network of verified connections.
          </p>
        </div>
        <Button onClick={() => navigate("/contacts/discovery")} compact className="h-10 px-4 rounded-xl">
           <Plus size={18} className="mr-2" />
           Find People
        </Button>
      </div>

      <div className="relative">
        <Input
          placeholder="Filter contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11 rounded-xl bg-muted/30 border-border focus:bg-background transition-all"
          icon={<Search size={16} className="text-muted-foreground/50" />}
        />
      </div>

      <div className="space-y-3">
        {filteredContacts.length > 0 ? (
          filteredContacts.map((user) => (
            <ContactCard 
                key={user.id} 
                user={user} 
                onActionComplete={loadContacts} 
            />
          ))
        ) : contacts.length > 0 ? (
            <div className="py-12 text-center text-muted-foreground/40 italic text-sm">
                No contacts matching "{searchTerm}"
            </div>
        ) : (
          <div className="py-20 text-center flex flex-col items-center gap-4 bg-muted/10 rounded-3xl border border-dashed border-border/50">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground/30 grayscale opacity-40">
                <Users size={32} />
            </div>
            <div className="space-y-1">
                <p className="text-sm font-bold text-muted-foreground">Your contact list is empty</p>
                <p className="text-xs text-muted-foreground/60">Start discovering new people to build your network.</p>
            </div>
            <Button 
                variant="outline" 
                compact
                className="mt-2 rounded-xl h-9"
                onClick={() => navigate("/contacts/discovery")}
            >
                Discover Users
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
