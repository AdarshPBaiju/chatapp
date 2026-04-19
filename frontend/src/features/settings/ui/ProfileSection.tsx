import { useState, useEffect } from "react";
import { User, Mail, Phone, Camera, Check, Info, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button, Input } from "@/shared/ui/FormControls";
import { fetchProfile, updateProfile } from "../api";
import { UserProfile } from "../types";
import { cn } from "@/shared/lib/utils";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";

export function ProfileSection() {
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorVisible, setErrorVisible] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { values, setFieldValue, getFieldProps, handleSubmit, setValues, errors, touched } = useForm({
    initialValues: {
      full_name: "",
      phone_number: "",
      bio: "",
      gender: "" as "male" | "female" | "other" | "",
      profile_picture: null as File | null
    },
    schema: {
      full_name: v.string().name("Invalid characters in name").required("Legal name is required"),
      phone_number: v.string().min(5, "Invalid phone number"),
      bio: v.string().max(500, "Bio is too long"),
      profile_picture: v.file({ maxMb: 2, exts: ["jpg", "jpeg", "png", "webp"] }, "Image must be under 2MB (JPG/PNG)")
    },
    onSubmit: async (formValues) => {
      try {
        setIsSaving(true);
        setErrorVisible(null);
        setSuccess(false);

        const formData = new FormData();
        formData.append("full_name", formValues.full_name);
        formData.append("bio", formValues.bio || "");
        formData.append("gender", formValues.gender || "");
        formData.append("phone_number", formValues.phone_number || "");
        
        if (formValues.profile_picture) {
          formData.append("profile_picture", formValues.profile_picture);
        }

        const data = await updateProfile(formData);
        if (data.success && data.data) {
          setSuccess(true);
          setInitialProfile(data.data);
          // Only clear the file, keep the other values as updated
          setFieldValue("profile_picture", null);
        } else if (data.success && !data.data) {
          setErrorVisible("Update successful but no profile data returned.");
        } else {
          setErrorVisible(data.message || "Failed to update profile.");
        }
      } catch (err: any) {
        setErrorVisible("Server error during identity update.");
      } finally {
        setIsSaving(false);
      }
    }
  });

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  async function loadProfile() {
    try {
      setIsLoading(true);
      const data = await fetchProfile();
      if (data.success && data.data) {
        setInitialProfile(data.data);
        setValues({
          full_name: data.data.full_name || "",
          phone_number: data.data.phone_number || "",
          bio: data.data.bio || "",
          gender: data.data.gender || "",
          profile_picture: null
        });
      } else if (data.success && !data.data) {
        setErrorVisible("Initial profile data is missing.");
      }
    } catch (err: any) {
      setErrorVisible("Failed to load identity profile.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // DSL handles validation on submit/blur, but we set it here for preview
      setFieldValue("profile_picture", file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Synchronizing...</p>
    </div>
  );

  if (!initialProfile) return (
    <div className="p-8 text-center text-destructive font-bold">
      Critical error loading identity data.
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Profile Header Card */}
      <div className="flex items-center gap-6 group border-b border-border pb-6">
        <div className="relative group">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className={cn(
              "h-20 w-20 rounded-2xl bg-muted border-2 border-background shadow-md flex items-center justify-center overflow-hidden transition-all duration-300",
              touched.profile_picture && errors.profile_picture ? "border-destructive/40 ring-2 ring-destructive/10" : "group-hover:shadow-primary/5"
            )}
          >
            {previewUrl || initialProfile.profile_picture ? (
              <img 
                src={previewUrl || initialProfile.profile_picture || ""} 
                alt={values.full_name} 
                className="h-full w-full object-cover" 
              />
            ) : (
              <User size={32} className="text-muted-foreground/30" />
            )}
            
            {/* Upload Overlay */}
            <label 
              htmlFor="avatar-upload" 
              className="absolute inset-0 bg-foreground/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[1px]"
            >
              <Camera size={20} className="text-background mb-1" />
              <span className="text-[8px] text-background font-bold uppercase tracking-[0.1em]">Edit</span>
            </label>
          </motion.div>
          
          <input 
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{initialProfile.full_name || "Guest Identity"}</h2>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail size={14} />
            <span className="text-xs font-medium tracking-wide">{initialProfile.email}</span>
            <div className="h-3 w-px bg-border mx-1" />
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
              <Check size={9} /> Verified
            </span>
          </div>
        </div>
      </div>

      {touched.profile_picture && errors.profile_picture && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 rounded-2xl bg-destructive/10 px-5 py-3 text-destructive text-xs font-bold uppercase tracking-widest border border-destructive/20 w-fit"
        >
          <AlertCircle size={16} />
          {errors.profile_picture}
        </motion.div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <Input
            compact
            label="Legal Full Name"
            icon={<User size={16} />}
            placeholder="Johnathan Doe"
            {...getFieldProps("full_name")}
            disabled={isSaving}
          />
          <Input
            compact
            label="Mobile Identity"
            icon={<Phone size={16} />}
            placeholder="+1 (555) 000-0000"
            {...getFieldProps("phone_number")}
            disabled={isSaving}
          />
        </div>

        <div className="space-y-2">
          <label className={cn(
            "pl-1 text-[9px] font-bold uppercase tracking-[0.2em] transition-colors",
            touched.bio && errors.bio ? "text-destructive" : "text-muted-foreground"
          )}>
            Account Bio
          </label>
          <div className="relative group">
            <textarea
              placeholder="Who are you in the digital world?"
              className={cn(
                "w-full min-h-[100px] p-4 bg-background border transition-all outline-none resize-none text-foreground placeholder:text-muted-foreground/40 text-sm leading-relaxed rounded-xl",
                touched.bio && errors.bio 
                  ? "border-destructive/40 ring-2 ring-destructive/5" 
                  : "border-border focus:border-primary focus:ring-2 focus:ring-primary/5 shadow-sm"
              )}
              {...getFieldProps("bio")}
              disabled={isSaving}
            />
            <div className={cn(
              "absolute top-4 right-4 transition-colors",
              touched.bio && errors.bio ? "text-destructive" : "text-muted-foreground group-focus-within:text-foreground"
            )}>
              {touched.bio && errors.bio ? <AlertCircle size={16} /> : <Info size={16} />}
            </div>
          </div>
          {touched.bio && errors.bio && (
            <p className="pl-1 text-[9px] font-bold text-destructive uppercase tracking-widest">{errors.bio}</p>
          )}
        </div>

        <div className="space-y-2">
           <label className="pl-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Gender Identity</label>
           <div className="grid grid-cols-3 gap-2">
              {(['male', 'female', 'other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFieldValue("gender", g)}
                  className={cn(
                    "rounded-xl border-2 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                    values.gender === g 
                      ? "border-primary bg-primary text-primary-foreground shadow-sm" 
                      : "border-muted bg-muted text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
                  )}
                  disabled={isSaving}
                >
                  {g}
                </button>
              ))}
           </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <div className="hidden sm:block">
             <AnimatePresence>
               {success && (
                 <motion.p 
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -10 }}
                   className="text-[10px] font-bold text-success flex items-center gap-1.5"
                 >
                   <Check size={14} className="p-0.5 rounded-full bg-success/10" />
                   Changes saved.
                 </motion.p>
               )}
               {errorVisible && (
                 <motion.p 
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -10 }}
                   className="text-[10px] font-bold text-destructive"
                 >
                   {errorVisible}
                 </motion.p>
               )}
             </AnimatePresence>
          </div>

          <Button
            compact
            type="submit" 
            isLoading={isSaving} 
            disabled={isSaving} 
            className="w-full sm:w-auto px-8"
          >
            Update Profile
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
