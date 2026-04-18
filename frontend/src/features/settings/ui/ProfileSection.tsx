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
      <div className="h-10 w-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
      <p className="text-sm font-bold tracking-widest text-slate-400 uppercase">Synchronizing...</p>
    </div>
  );

  if (!initialProfile) return (
    <div className="p-8 text-center text-rose-500 font-bold">
      Critical error loading identity data.
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      {/* Profile Header Card */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-8 group">
        <div className="relative group">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className={cn(
              "h-32 w-32 rounded-[32px] bg-slate-50 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden transition-all duration-500",
              touched.profile_picture && errors.profile_picture ? "border-rose-400 ring-4 ring-rose-500/10" : "group-hover:shadow-slate-200"
            )}
          >
            {previewUrl || initialProfile.profile_picture ? (
              <img 
                src={previewUrl || initialProfile.profile_picture || ""} 
                alt={values.full_name} 
                className="h-full w-full object-cover" 
              />
            ) : (
              <User size={48} className="text-slate-300" />
            )}
            
            {/* Upload Overlay */}
            <label 
              htmlFor="avatar-upload" 
              className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[2px]"
            >
              <Camera size={28} className="text-white mb-2" />
              <span className="text-[10px] text-white font-bold uppercase tracking-[0.2em]">Change</span>
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
        
        <div className="space-y-2">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">{initialProfile.full_name || "Guest Identity"}</h2>
          <div className="flex items-center gap-2 text-slate-500">
            <Mail size={16} />
            <span className="text-sm font-medium tracking-wide">{initialProfile.email}</span>
            <div className="h-4 w-px bg-slate-200 mx-2" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              <Check size={10} /> Verified
            </span>
          </div>
        </div>
      </div>

      {touched.profile_picture && errors.profile_picture && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 rounded-2xl bg-rose-50 px-5 py-3 text-rose-600 text-xs font-bold uppercase tracking-widest border border-rose-100 w-fit"
        >
          <AlertCircle size={16} />
          {errors.profile_picture}
        </motion.div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-10">
        <div className="grid md:grid-cols-2 gap-8">
          <Input
            label="Legal Full Name"
            icon={<User size={18} />}
            placeholder="Johnathan Doe"
            {...getFieldProps("full_name")}
            disabled={isSaving}
          />
          <Input
            label="Mobile Identity"
            icon={<Phone size={18} />}
            placeholder="+1 (555) 000-0000"
            {...getFieldProps("phone_number")}
            disabled={isSaving}
          />
        </div>

        <div className="space-y-3">
          <label className={cn(
            "pl-1 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors",
            touched.bio && errors.bio ? "text-rose-500" : "text-slate-400"
          )}>
            Account Bio
          </label>
          <div className="relative group">
            <textarea
              placeholder="Who are you in the digital world?"
              className={cn(
                "w-full min-h-[140px] p-5 bg-white border transition-all outline-none resize-none text-slate-950 placeholder:text-slate-400 text-sm leading-relaxed rounded-[24px]",
                touched.bio && errors.bio 
                  ? "border-rose-400 ring-4 ring-rose-500/5" 
                  : "border-slate-100 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 shadow-sm"
              )}
              {...getFieldProps("bio")}
              disabled={isSaving}
            />
            <div className={cn(
              "absolute top-5 right-5 transition-colors",
              touched.bio && errors.bio ? "text-rose-400" : "text-slate-300 group-focus-within:text-slate-900"
            )}>
              {touched.bio && errors.bio ? <AlertCircle size={18} /> : <Info size={18} />}
            </div>
          </div>
          {touched.bio && errors.bio && (
            <p className="pl-1 text-[10px] font-bold text-rose-500 uppercase tracking-widest">{errors.bio}</p>
          )}
        </div>

        <div className="space-y-3">
           <label className="pl-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Gender Identity</label>
           <div className="grid grid-cols-3 gap-3">
              {(['male', 'female', 'other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFieldValue("gender", g)}
                  className={cn(
                    "rounded-2xl border-2 py-4 text-xs font-bold uppercase tracking-widest transition-all",
                    values.gender === g 
                      ? "border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-900/20" 
                      : "border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200 hover:bg-white hover:text-slate-900"
                  )}
                  disabled={isSaving}
                >
                  {g}
                </button>
              ))}
           </div>
        </div>

        <div className="pt-6 flex items-center justify-between">
          <div className="hidden sm:block">
             <AnimatePresence>
               {success && (
                 <motion.p 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="text-sm font-bold text-emerald-600 flex items-center gap-2"
                 >
                   <Check size={18} className="p-0.5 rounded-full bg-emerald-100" />
                   Changes deployed successfully.
                 </motion.p>
               )}
               {errorVisible && (
                 <motion.p 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="text-sm font-bold text-rose-500"
                 >
                   {errorVisible}
                 </motion.p>
               )}
             </AnimatePresence>
          </div>

          <Button
            type="submit" 
            isLoading={isSaving} 
            disabled={isSaving} 
            className="w-full sm:w-auto px-12 py-5"
          >
            Update Identity
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
