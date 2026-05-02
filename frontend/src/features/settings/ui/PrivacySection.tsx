import { Shield, Users, UserPlus, Lock, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";
import { UserProfile } from "../types";
import { Button } from "@/shared/ui/FormControls";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/ui/Toast";
import { fetchProfile, updateProfile } from "../api";

export function PrivacySection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const { values, setFieldValue, handleSubmit, setValues } = useForm({
    initialValues: {
      who_can_add_me: "everyone" as "everyone" | "contacts" | "request",
    },
    schema: {
      who_can_add_me: v.string().required("Privacy policy is required"),
    },
    onSubmit: async (data) => {
      setIsSaving(true);
      try {
        const result = await updateProfile(data);
        if (result.success && result.data) {
          setProfile(result.data);
          toast.success("Privacy settings updated.");
        } else {
          toast.error(result.message || "Failed to update privacy settings.");
        }
      } catch (err) {
        toast.error("Failed to update privacy settings.");
      } finally {
        setIsSaving(false);
      }
    },
  });

  useEffect(() => {
    fetchProfile().then((res) => {
      if (res.success && res.data) {
        setProfile(res.data);
        setValues({ who_can_add_me: res.data.who_can_add_me });
      }
      setIsLoading(false);
    });
  }, [setValues]);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="animate-spin text-primary/40" size={32} />
      </div>
    );
  }

  if (!profile) return null;

  const options = [
    {
      id: "everyone",
      title: "Everyone",
      description: "Any user can add you to groups directly.",
      icon: <Users size={20} />,
    },
    {
      id: "contacts",
      title: "Contacts Only",
      description: "Only users in your contact list can add you.",
      icon: <UserPlus size={20} />,
    },
    {
      id: "request",
      title: "Request Required",
      description: "Every group invitation must be approved by you.",
      icon: <Lock size={20} />,
    },
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="text-primary" size={24} />
          Privacy & Sovereignty
        </h2>
        <p className="text-muted-foreground text-sm font-medium">
          Control how others interact with you and manage your digital footprint.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Invitation Sovereignty</span>
            <p className="text-xs text-muted-foreground">Who is allowed to add you to group conversations?</p>
          </div>

          <div className="grid gap-3">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFieldValue("who_can_add_me", option.id)}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300 text-left",
                  values.who_can_add_me === option.id
                    ? "bg-primary/5 border-primary shadow-sm"
                    : "bg-muted/30 border-border hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "p-2 rounded-xl transition-colors",
                  values.who_can_add_me === option.id ? "bg-primary text-white" : "bg-background text-muted-foreground"
                )}>
                  {option.icon}
                </div>
                <div className="flex-1 space-y-1">
                  <p className={cn(
                    "text-sm font-bold transition-colors",
                    values.who_can_add_me === option.id ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {option.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {option.description}
                  </p>
                </div>
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                  values.who_can_add_me === option.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                )}>
                  {values.who_can_add_me === option.id && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border/50">
          <Button
            onClick={() => handleSubmit()}
            isLoading={isSaving}
            className="w-full md:w-auto px-10"
          >
            Save Privacy Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
