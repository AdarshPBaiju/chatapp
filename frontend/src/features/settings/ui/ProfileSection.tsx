import { useState, useEffect } from "react";
import { User, Mail, Phone, Camera } from "lucide-react";


import { Button, Input } from "@/shared/ui/FormControls";
import { fetchProfile, updateProfile } from "../api";
import { UserProfile } from "../types";

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

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading profile...</div>;
  if (!profile) return <div className="p-8 text-center text-red-500">Error loading profile data.</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center gap-6 pb-8 border-b border-slate-100">
        <div className="relative group">
          <div className="h-24 w-24 rounded-full bg-slate-100 border-4 border-white shadow-lg flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105">
            {previewUrl || profile.profile_picture ? (
              <img 
                src={previewUrl || profile.profile_picture || ""} 
                alt={profile.full_name} 
                className="h-full w-full object-cover" 
              />
            ) : (
              <User size={40} className="text-slate-400" />
            )}
            
            {/* Upload Overlay */}
            <label 
              htmlFor="avatar-upload" 
              className="absolute inset-0 bg-slate-900/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera size={24} className="text-white mb-1" />
              <span className="text-[10px] text-white font-bold uppercase tracking-wider">Change</span>
            </label>
          </div>
          
          <input 
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">{profile.full_name || "New User"}</h2>
          <p className="text-slate-500">{profile.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Full Name</label>
            <Input
              icon={<User size={18} />}
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Phone Number</label>
            <Input
              icon={<Phone size={18} />}
              value={profile.phone_number || ""}
              onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
              placeholder="+1 234 567 890"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Email Address (Primary)</label>
          <Input
            icon={<Mail size={18} />}
            value={profile.email}
            disabled
            className="bg-slate-50 text-slate-500 cursor-not-allowed"
          />
          <p className="text-xs text-slate-400">Your email address is verified and locked to your identity.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            placeholder="Tell us about yourself..."
            className="w-full min-h-[120px] p-4 bg-white border-2 border-slate-100 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all outline-none resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Gender</label>
          <select
            value={profile.gender}
            onChange={(e) => setProfile({ ...profile, gender: e.target.value as any })}
            className="w-full h-12 px-4 bg-white border-2 border-slate-100 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all outline-none"
          >
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
        {success && <p className="text-sm font-medium text-green-500">Profile updated successfully!</p>}

        <div className="pt-4">
          <Button type="submit" isLoading={isSaving} disabled={isSaving} className="px-8">
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
