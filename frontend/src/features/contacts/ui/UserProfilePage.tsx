import { User, Mail, AtSign, MessageCircle, UserPlus, UserX, UserCheck, ShieldAlert, Loader2, ArrowLeft, Pencil, Calendar, Info, Users, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ContactUser } from "../types";
import { httpClient } from "@/shared/http/client";
import { Button } from "@/shared/ui/FormControls";
import { manageContact } from "../api";
import { toast } from "@/shared/ui/Toast";
import { cn } from "@/shared/lib/utils";

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<ContactUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]);

  async function loadUser() {
    setLoading(true);
    try {
      const res = await httpClient.get<{ success: boolean; data: any }>(`/users/client/profile/public/${userId}/`);
      if (res.data.success) {
        setUser(res.data.data);
        setNickname(res.data.data.nickname || "");
      }
    } catch (err) {
      toast.error("User not found.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "add" | "accept" | "decline" | "block" | "unblock" | "remove" | "update_nickname", customNickname?: string) {
    if (!user) return;
    setActionLoading(true);
    try {
      const res = await manageContact(user.id, action, customNickname || null);
      if (res.success) {
        toast.success(res.message);
        setIsAccepting(false);
        setIsEditingNickname(false);
        loadUser();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error("Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Joined recently";
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return "Joined recently";
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center w-full">
        <div className="relative">
            <Loader2 className="animate-spin text-primary" size={40} />
            <div className="absolute inset-0 blur-lg bg-primary/20 animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-20 text-center space-y-4 w-full">
        <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <UserX size={40} className="text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">User Not Found</h2>
        <p className="text-muted-foreground max-w-xs mx-auto">The user profile you are looking for doesn't exist or has been removed.</p>
        <Button onClick={() => navigate(-1)} variant="outline" className="rounded-xl px-8 mt-4">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="w-full pb-20 animate-in fade-in duration-700">
      {/* Unified Header Card */}
      <div className="w-full px-4 md:px-8 lg:px-12 mt-4 md:mt-8 mb-10">
          <div className="bg-card rounded-[2rem] border border-border/50 shadow-sm overflow-hidden relative">
            {/* Banner Half */}
            <div className="relative h-48 md:h-72 w-full bg-gradient-to-br from-primary/20 via-primary/5 to-muted group">
                {user.banner_picture && (
                     <img 
                        src={user.banner_picture} 
                        alt="" 
                        className="absolute inset-0 h-full w-full object-cover" 
                     />
                )}
                {!user.banner_picture && (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
                )}
                <button 
                    onClick={() => navigate(-1)}
                    className="absolute top-6 left-6 z-30 flex items-center gap-2 p-2 px-4 rounded-xl bg-background/50 backdrop-blur-md border border-white/10 text-xs font-bold hover:bg-background/80 transition-all shadow-lg"
                >
                    <ArrowLeft size={14} />
                    <span>BACK</span>
                </button>
            </div>

            {/* Info Half */}
            <div className="relative px-6 sm:px-10 pb-8 md:pb-12">
                <div className="flex flex-col md:flex-row md:items-end gap-6 w-full">
                    {/* Avatar - Pulled up over the banner */}
                    <div className="relative -mt-16 md:-mt-20 z-20 shrink-0">
                        <div className={cn(
                            "h-32 w-32 md:h-40 md:w-40 rounded-[2.5rem] bg-card border-4 border-card shadow-xl flex items-center justify-center overflow-hidden ring-1 ring-border/50 transition-all",
                            user.contact_status === "blocked" && "ring-destructive/20 grayscale-[0.5]"
                        )}>
                            <div className={cn(
                                "h-full w-full flex items-center justify-center overflow-hidden",
                                user.contact_status === "blocked" ? "bg-destructive/10" : "bg-primary/5"
                            )}>
                                {user.profile_picture ? (
                                    <img src={user.profile_picture} alt={user.full_name} className="h-full w-full object-cover" />
                                ) : (
                                    <User size={64} className={cn("md:size-20", user.contact_status === "blocked" ? "text-destructive/40" : "text-primary/40")} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Text Info */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 w-full mt-2 md:mt-0 mb-2 md:mb-6 md:pl-2">
                        <div className="flex flex-col items-start w-full">
                            {!isEditingNickname ? (
                                <div className="flex flex-col gap-1 items-start w-full">
                                    <div className="flex items-center gap-3">
                                        <h1 className={cn(
                                            "text-3xl md:text-4xl font-black tracking-tight",
                                            user.contact_status === "blocked" && "text-destructive/80"
                                        )}>{user.nickname || user.full_name}</h1>
                                        {user.contact_status === "accepted" && (
                                            <button 
                                                onClick={() => setIsEditingNickname(true)}
                                                className="p-2 rounded-xl bg-muted/50 hover:bg-muted transition-all text-muted-foreground hover:text-primary"
                                                title="Edit Nickname"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                    </div>
                                    {user.nickname && (
                                        <p className="text-sm md:text-base font-bold text-muted-foreground uppercase tracking-widest">{user.full_name}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 w-full max-w-lg animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center gap-2 w-full">
                                        <div className="relative flex-1">
                                            <input 
                                                type="text"
                                                value={nickname}
                                                onChange={(e) => setNickname(e.target.value)}
                                                className="w-full h-12 rounded-2xl bg-muted/30 border border-border px-6 text-lg font-bold outline-none focus:border-primary focus:ring-4 ring-primary/5 transition-all"
                                                autoFocus
                                                placeholder="Personal Nickname..."
                                            />
                                        </div>
                                        <Button 
                                            onClick={() => handleAction("update_nickname", nickname)}
                                            isLoading={actionLoading}
                                            className="h-12 rounded-2xl px-6 font-bold shadow-lg shadow-primary/20"
                                        >
                                            Save
                                        </Button>
                                        <Button 
                                            onClick={() => {
                                                setIsEditingNickname(false);
                                                setNickname(user.nickname || "");
                                            }}
                                            variant="ghost"
                                            className="h-12 rounded-2xl px-4 text-muted-foreground hover:text-foreground"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">This nickname is private to you</p>
                                </div>
                            )}
                            
                            <div className="flex items-center gap-2 text-muted-foreground/80 bg-muted/50 w-fit px-4 py-1.5 rounded-full border border-border/50 shadow-sm mt-4">
                                <AtSign size={14} className="text-primary/50" />
                                <span className="text-xs font-bold tracking-tight">@{user.username}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons (Moved to Header Right Side) */}
                    <div className="flex flex-wrap md:flex-nowrap items-center justify-start md:justify-end gap-3 w-full md:w-auto md:ml-auto shrink-0 pb-2 md:pb-6 mt-4 md:mt-0">
                        {user.contact_status === "accepted" && (
                            <Button className="rounded-2xl px-8 h-12 shadow-xl shadow-primary/20 text-sm font-bold shrink-0">
                                <MessageCircle size={18} className="mr-2" />
                                Send Message
                            </Button>
                        )}

                        {user.contact_status !== "blocked" && (
                            <>
                                {!user.is_contact && user.contact_status !== "incoming" && user.contact_status !== "pending" && (
                                <Button 
                                    onClick={() => handleAction("add")}
                                    isLoading={actionLoading}
                                    className="rounded-2xl px-8 h-12 text-sm font-bold shadow-lg shrink-0"
                                >
                                    <UserPlus size={18} className="mr-2" />
                                    Add to Contacts
                                </Button>
                                )}

                                {user.contact_status === "incoming" && (
                                <div className="flex flex-col gap-3 w-full max-w-xs shrink-0">
                                    {!isAccepting ? (
                                    <div className="flex gap-2 w-full">
                                        <Button 
                                            onClick={() => setIsAccepting(true)}
                                            className="flex-1 rounded-2xl h-12 text-sm font-bold shadow-xl shadow-primary/20"
                                        >
                                            Accept
                                        </Button>
                                        <Button 
                                            onClick={() => handleAction("decline")}
                                            isLoading={actionLoading}
                                            variant="outline"
                                            className="flex-1 rounded-2xl h-12 text-sm font-bold border-destructive/20 text-destructive hover:bg-destructive/5"
                                        >
                                            Decline
                                        </Button>
                                    </div>
                                    ) : (
                                    <div className="flex flex-col gap-3 w-full p-4 rounded-3xl bg-muted/20 border border-border animate-in fade-in zoom-in-95 duration-300">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-center">Set a Nickname?</h4>
                                        <input 
                                            type="text"
                                            placeholder="Optional nickname..."
                                            value={nickname}
                                            onChange={(e) => setNickname(e.target.value)}
                                            className="w-full h-10 rounded-xl bg-background border border-border px-4 text-xs font-medium outline-none focus:border-primary transition-all"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <Button 
                                                onClick={() => handleAction("accept", nickname)}
                                                isLoading={actionLoading}
                                                className="flex-1 rounded-xl h-10 text-xs font-bold"
                                            >
                                                Confirm
                                            </Button>
                                            <Button 
                                                onClick={() => setIsAccepting(false)}
                                                variant="ghost"
                                                className="flex-1 rounded-xl h-10 text-xs font-bold"
                                            >
                                                Skip
                                            </Button>
                                        </div>
                                    </div>
                                    )}
                                </div>
                                )}

                                {user.contact_status === "pending" && user.is_contact && (
                                    <Button 
                                        onClick={() => handleAction("remove")}
                                        isLoading={actionLoading}
                                        variant="outline"
                                        className="rounded-2xl px-8 h-12 text-sm font-bold border-border shrink-0"
                                    >
                                        Cancel Request
                                    </Button>
                                )}

                                {user.contact_status === "accepted" && (
                                    <Button 
                                        onClick={() => handleAction("remove")}
                                        isLoading={actionLoading}
                                        variant="outline"
                                        className="rounded-2xl px-6 h-12 text-sm font-bold border-destructive/10 text-destructive/60 hover:text-destructive hover:bg-destructive/5 hover:border-destructive/20 transition-all shrink-0"
                                    >
                                        <UserX size={18} className="mr-2" />
                                        Remove
                                    </Button>
                                )}
                            </>
                        )}

                        {user.contact_status === "blocked" ? (
                            <Button 
                                onClick={() => handleAction("unblock")}
                                isLoading={actionLoading}
                                className="rounded-2xl px-8 h-12 text-sm font-bold shadow-xl shadow-primary/20 shrink-0"
                            >
                                Unblock User
                            </Button>
                        ) : (
                            <Button 
                                onClick={() => handleAction("block")}
                                isLoading={actionLoading}
                                variant="ghost"
                                className="rounded-2xl px-6 h-12 text-sm text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-all font-bold shrink-0"
                            >
                                <ShieldAlert size={18} className="mr-2" />
                                Block
                            </Button>
                        )}
                    </div>

                </div>
            </div>
          </div>
      </div>

      {/* Profile Content (Bento Box Stats) */}
      <div className="px-4 md:px-8 lg:px-12 w-full pt-4 md:pt-8 mb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full">
            
            {/* Bio Box (Spans 2 cols, 2 rows) */}
            <div className="col-span-1 md:col-span-2 lg:col-span-2 md:row-span-2 group p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 shadow-sm relative overflow-hidden flex flex-col justify-start min-h-[220px]">
                <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-700">
                    <MessageCircle size={140} />
                </div>
                <div className="relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 mb-4 block">About Me</span>
                    {user.bio && user.contact_status !== "blocked" ? (
                        <p className="text-xl md:text-2xl text-foreground/90 font-medium leading-relaxed italic">
                            "{user.bio}"
                        </p>
                    ) : user.contact_status !== "blocked" ? (
                        <p className="text-sm md:text-base text-muted-foreground italic">No bio provided yet.</p>
                    ) : (
                        <p className="text-sm md:text-base text-muted-foreground italic">Bio is hidden.</p>
                    )}
                </div>
            </div>

            {/* Connections Stat */}
            <div className="col-span-1 group p-6 md:p-8 rounded-[2.5rem] bg-card border border-border/50 shadow-sm hover:shadow-md transition-all flex flex-col items-start justify-between min-h-[160px]">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                    <Users size={20} />
                </div>
                <div className="mt-auto">
                    <h3 className="text-4xl font-black tracking-tighter text-foreground">{user.total_contacts}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mt-1">Connections</p>
                </div>
            </div>

            {/* Mutual Stat */}
            <div className="col-span-1 group p-6 md:p-8 rounded-[2.5rem] bg-card border border-border/50 shadow-sm hover:shadow-md transition-all flex flex-col items-start justify-between min-h-[160px]">
                <div className="h-12 w-12 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500 mb-4 group-hover:scale-110 transition-transform">
                    <UserCheck size={20} />
                </div>
                <div className="mt-auto">
                    <h3 className="text-4xl font-black tracking-tighter text-foreground">{user.mutual_contacts}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mt-1">Mutual</p>
                </div>
            </div>

            {/* Email Span Box */}
            <div className="col-span-1 md:col-span-2 group p-6 md:p-8 rounded-[2.5rem] bg-card border border-border/50 shadow-sm hover:shadow-md transition-all flex items-center gap-6 min-h-[120px]">
                <div className="h-14 w-14 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0 group-hover:scale-110 transition-transform">
                    <Mail size={24} />
                </div>
                <div className="overflow-hidden">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1.5">Email Address</p>
                    <p className="text-lg md:text-xl font-bold text-foreground truncate">{user.email}</p>
                </div>
            </div>

            {/* Status Box */}
            <div className="col-span-1 md:col-span-2 group p-6 md:p-8 rounded-[2.5rem] bg-card border border-border/50 shadow-sm hover:shadow-md transition-all flex items-center gap-6 min-h-[120px]">
                <div className={cn(
                    "h-14 w-14 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform",
                    user.contact_status === "blocked" ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-500"
                )}>
                    {user.contact_status === "blocked" ? <ShieldAlert size={24} /> : <UserCheck size={24} />}
                </div>
                <div className="overflow-hidden">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1.5">Current Status</p>
                    <p className={cn(
                        "text-lg md:text-xl font-bold capitalize truncate",
                        user.contact_status === "blocked" && "text-destructive"
                    )}>{user.contact_status || "Not Connected"}</p>
                </div>
            </div>

            {/* Joined */}
            <div className="col-span-1 group p-6 md:p-8 rounded-[2.5rem] bg-card border border-border/50 shadow-sm hover:shadow-md transition-all flex flex-col items-start justify-between min-h-[120px]">
                <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3 group-hover:scale-110 transition-transform">
                    <Calendar size={18} />
                </div>
                <div className="mt-auto">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">Joined</p>
                    <p className="text-sm font-bold text-foreground truncate">{formatDate(user.date_joined)}</p>
                </div>
            </div>

            {/* Gender */}
            <div className="col-span-1 group p-6 md:p-8 rounded-[2.5rem] bg-card border border-border/50 shadow-sm hover:shadow-md transition-all flex flex-col items-start justify-between min-h-[120px]">
                <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 mb-3 group-hover:scale-110 transition-transform">
                    <Info size={18} />
                </div>
                <div className="mt-auto">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">Gender</p>
                    <p className="text-sm font-bold capitalize truncate text-foreground">{user.gender || "Not specified"}</p>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}
