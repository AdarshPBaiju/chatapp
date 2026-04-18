import { useState, useEffect } from "react";
import { User, Mail, Phone, Camera, Check, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button, Input } from "@/shared/ui/FormControls";
import { fetchProfile, updateProfile } from "../api";
import { UserProfile } from "../types";
import { cn } from "@/shared/lib/utils";

export function ProfileSection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      if (data.success) {
        setProfile(data.data);
      }
    } catch (err: any) {
      setError("Failed to load profile.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size must be less than 2MB");
        return;
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      const formData = new FormData();
      formData.append("full_name", profile.full_name);
      formData.append("bio", profile.bio || "");
      formData.append("gender", profile.gender || "");
      formData.append("phone_number", profile.phone_number || "");
      
      if (selectedFile) {
        formData.append("profile_picture", selectedFile);
      }

      const data = await updateProfile(formData);
      if (data.success) {
        setSuccess(true);
        setSelectedFile(null);
        setProfile(data.data);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError("Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <div className="h-10 w-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
      <p className="text-sm font-bold tracking-widest text-slate-400 uppercase">Synchronizing...</p>
    </div>
  );

  if (!profile) return (
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
            className="h-32 w-32 rounded-[32px] bg-slate-50 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden transition-all duration-500 group-hover:shadow-slate-200"
          >
            {previewUrl || profile.profile_picture ? (
              <img 
                src={previewUrl || profile.profile_picture || ""} 
                alt={profile.full_name} 
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
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">{profile.full_name || "Guest Identity"}</h2>
          <div className="flex items-center gap-2 text-slate-500">
            <Mail size={16} />
            <span className="text-sm font-medium tracking-wide">{profile.email}</span>
            <div className="h-4 w-px bg-slate-200 mx-2" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              <Check size={10} /> Verified
            </span>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="space-y-10">
        <div className="grid md:grid-cols-2 gap-8">
          <Input
            label="Legal Full Name"
            icon={<User size={18} />}
            value={profile.full_name}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            placeholder="Johnathan Doe"
            required
          />
          <Input
            label="Mobile Identity"
            icon={<Phone size={18} />}
            value={profile.phone_number || ""}
            onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
            placeholder="+1 (555) 000-0000"
          />
        </div>

        <div className="space-y-3">
          <label className="pl-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Account Bio</label>
          <div className="relative group">
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              placeholder="Who are you in the digital world?"
              className="w-full min-h-[140px] p-5 bg-white border border-slate-100 rounded-[24px] focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all outline-none resize-none text-slate-950 placeholder:text-slate-400 text-sm leading-relaxed"
            />
            <div className="absolute top-5 right-5 text-slate-300 group-focus-within:text-slate-900 transition-colors">
              <Info size={18} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
           <label className="pl-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Gender Identity</label>
           <div className="grid grid-cols-3 gap-3">
              {(['male', 'female', 'other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setProfile({ ...profile, gender: g })}
                  className={cn(
                    "rounded-2xl border-2 py-4 text-xs font-bold uppercase tracking-widest transition-all",
                    profile.gender === g 
                      ? "border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-900/20" 
                      : "border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200 hover:bg-white hover:text-slate-900"
                  )}
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
               {error && (
                 <motion.p 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="text-sm font-bold text-rose-500"
                 >
                   {error}
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
