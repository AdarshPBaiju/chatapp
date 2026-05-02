import { useState, useEffect } from "react";
import { User, Phone, Camera, Check, Info, AlertCircle, AtSign, Shield, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button, Input } from "@/shared/ui/FormControls";
import { fetchProfile, updateProfile, checkUsernameAvailability } from "../api";
import { UserProfile } from "../types";
import { cn } from "@/shared/lib/utils";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";
import { toast } from "@/shared/ui/Toast";

export function ProfileSection() {
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorVisible, setErrorVisible] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'checking' | 'available' | 'taken' | null>(null);

  const { values, setFieldValue, getFieldProps, handleSubmit, setValues, errors, touched } = useForm({
    initialValues: {
      full_name: "",
      phone_number: "",
      bio: "",
      gender: "" as "male" | "female" | "other" | "",
      profile_picture: null as File | null,
      banner_picture: null as File | null,
      username: "",
      is_email_masked: false
    },
    schema: {
      full_name: v.string().name("Invalid characters in name").required("Legal name is required"),
      phone_number: v.string().min(5, "Invalid phone number"),
      bio: v.string().max(500, "Bio is too long"),
      username: v.string().min(3, "Too short").max(30, "Too long").required("Username is required"),
      profile_picture: v.file({ maxMb: 2, exts: ["jpg", "jpeg", "png", "webp"] }, "Image must be under 2MB"),
      banner_picture: v.file({ maxMb: 5, exts: ["jpg", "jpeg", "png", "webp"] }, "Banner must be under 5MB")
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
        formData.append("username", formValues.username);
        formData.append("is_email_masked", String(formValues.is_email_masked));

        if (formValues.profile_picture) formData.append("profile_picture", formValues.profile_picture);
        if (formValues.banner_picture) formData.append("banner_picture", formValues.banner_picture);

        const data = await updateProfile(formData);
        if (data.success && data.data) {
          toast.success("Profile updated successfully.");
          setSuccess(true);
          setInitialProfile(data.data);

          // Clear file inputs and preview URLs so it relies on the saved backend URL
          setFieldValue("profile_picture", null);
          setFieldValue("banner_picture", null);
          setPreviewUrl(null);
          setBannerUrl(null);
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

  useEffect(() => {
    if (values.username && values.username.length >= 3 && initialProfile && values.username !== initialProfile.username) {
      setUsernameStatus('checking');
      const timeoutId = setTimeout(async () => {
        try {
          const data = await checkUsernameAvailability(values.username);
          if (data.success && data.data) {
            setUsernameStatus(data.data.available ? 'available' : 'taken');
          } else {
            setUsernameStatus(null);
          }
        } catch (err) {
          setUsernameStatus(null);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setUsernameStatus(null);
    }
  }, [values.username, initialProfile?.username]);

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
          username: data.data.username || "",
          is_email_masked: data.data.is_email_masked || false,
          profile_picture: null,
          banner_picture: null
        });
      } else {
        setErrorVisible("Initial profile data is missing.");
      }
    } catch (err: any) {
      setErrorVisible("Failed to load identity profile.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleProfileFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFieldValue("profile_picture", file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  function handleBannerFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFieldValue("banner_picture", file);
      setBannerUrl(URL.createObjectURL(file));
    }
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Synchronizing...</p>
    </div>
  );

  if (!initialProfile) return null;

  const displayBanner = bannerUrl || (initialProfile.banner_picture && initialProfile.banner_picture !== "null" ? initialProfile.banner_picture : null);
  const displayAvatar = previewUrl || (initialProfile.profile_picture && initialProfile.profile_picture !== "null" ? initialProfile.profile_picture : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20 w-full px-4 md:px-8 lg:px-12 animate-in fade-in duration-500"
    >
      {/* Unified Header Card */}
      <div className="mb-10 bg-card rounded-[2rem] border border-border/50 shadow-sm overflow-hidden relative">

        {/* Banner Half */}
        <div className="relative h-48 md:h-64 w-full bg-gradient-to-br from-primary/20 via-primary/5 to-muted group">
          {displayBanner && (
            <img
              src={displayBanner}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-background/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[2px] z-10">
            <label
              htmlFor="banner-upload"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-background/90 text-foreground text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-background hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              <ImageIcon size={16} /> Edit Banner
            </label>
            <input
              id="banner-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerFileChange}
            />
          </div>
        </div>

        {/* Info Half */}
        <div className="relative px-6 sm:px-10 pb-8 md:pb-10">
          <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6 w-full">
            {/* Avatar - Pulled up over the banner */}
            <div className="relative -mt-14 md:-mt-20 z-20 shrink-0">
              <div className="relative group">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className={cn(
                    "h-28 w-28 md:h-40 md:w-40 rounded-[2.5rem] bg-card border-4 border-card shadow-xl flex items-center justify-center overflow-hidden transition-all duration-300 ring-1 ring-border/50",
                    touched.profile_picture && errors.profile_picture ? "border-destructive/40 ring-2 ring-destructive/10" : "group-hover:shadow-primary/5"
                  )}
                >
                  {displayAvatar ? (
                    <img
                      src={displayAvatar}
                      alt={values.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User size={56} className="text-muted-foreground/30" />
                  )}

                  {/* Upload Overlay */}
                  <label
                    htmlFor="avatar-upload"
                    className="absolute inset-0 bg-foreground/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[1px]"
                  >
                    <Camera size={24} className="text-background mb-1" />
                    <span className="text-[10px] text-background font-bold uppercase tracking-[0.1em]">Edit</span>
                  </label>
                </motion.div>

                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfileFileChange}
                />
              </div>
            </div>

            {/* Text Info */}
            <div className="flex flex-col text-foreground mt-2 md:mt-0 mb-2 md:mb-6 md:pl-2">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">{initialProfile.full_name || "Guest Identity"}</h2>
              <div className="flex items-center gap-2 md:gap-3 text-muted-foreground mt-1.5">
                <div className="flex items-center gap-1.5 bg-muted/50 px-3 py-1 rounded-lg">
                  <AtSign size={14} className="text-primary/70" />
                  <span className="text-sm font-bold tracking-wide">{initialProfile.username}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-success">
                  <Check size={10} /> Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(touched.profile_picture && errors.profile_picture) || (touched.banner_picture && errors.banner_picture) ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-2 rounded-2xl bg-destructive/10 px-5 py-4 text-destructive text-xs font-bold uppercase tracking-widest border border-destructive/20 w-full"
        >
          {errors.profile_picture && <div className="flex items-center gap-2"><AlertCircle size={14} /> Avatar: {errors.profile_picture}</div>}
          {errors.banner_picture && <div className="flex items-center gap-2"><AlertCircle size={14} /> Banner: {errors.banner_picture}</div>}
        </motion.div>
      ) : null}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8 w-full mt-8">

        {/* Section: Public Identity */}
        <div className="space-y-4 bg-card border border-border/50 p-6 sm:p-8 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4 mb-4">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User size={16} />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground/80">Public Identity</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Input
              compact
              label="Legal Full Name"
              icon={<User size={16} />}
              placeholder="Johnathan Doe"
              {...getFieldProps("full_name")}
              disabled={isSaving}
            />

            <div className="space-y-1">
              <Input
                compact
                label="Public Username"
                icon={<AtSign size={16} />}
                placeholder="john_doe"
                {...getFieldProps("username")}
                disabled={isSaving}
              />
              {touched.username && errors.username ? (
                <p className="pl-1 text-[10px] font-bold text-destructive uppercase tracking-wider mt-1">{errors.username}</p>
              ) : usernameStatus === 'checking' ? (
                <p className="pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1 animate-pulse">Checking availability...</p>
              ) : usernameStatus === 'available' ? (
                <p className="pl-1 text-[10px] font-bold text-success uppercase tracking-wider mt-1 flex items-center gap-1"><Check size={10} /> Available</p>
              ) : usernameStatus === 'taken' ? (
                <p className="pl-1 text-[10px] font-bold text-destructive uppercase tracking-wider mt-1 flex items-center gap-1"><AlertCircle size={10} /> Taken</p>
              ) : null}
              {initialProfile.username_change_limit === 0 ? (
                <p className="pl-1 text-[8px] font-bold text-primary uppercase tracking-widest mt-1">
                  Unlimited changes enabled
                </p>
              ) : initialProfile.username_change_history && initialProfile.username_change_history.length > 0 ? (
                <p className="pl-1 text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Changes used: {initialProfile.username_change_history.length} / {initialProfile.username_change_limit}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <label className="pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Account Bio
            </label>
            <div className="relative group">
              <textarea
                className={cn(
                  "w-full rounded-3xl bg-muted/30 border border-border p-5 text-sm font-medium placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all resize-none",
                  touched.bio && errors.bio && "border-destructive focus:border-destructive focus:ring-destructive/10"
                )}
                placeholder="Who are you in the digital world?"
                rows={4}
                disabled={isSaving}
                {...getFieldProps("bio")}
              />
              <Info size={16} className="absolute top-5 right-5 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
            </div>
            {touched.bio && errors.bio && (
              <p className="pl-1 text-xs font-bold text-destructive mt-1">{errors.bio}</p>
            )}
          </div>
        </div>

        {/* Section: Personal Details */}
        <div className="space-y-4 bg-card border border-border/50 p-6 sm:p-8 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4 mb-4">
            <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Info size={16} />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground/80">Personal Details</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-start">
            <Input
              compact
              label="Mobile Identity"
              icon={<Phone size={16} />}
              placeholder="+1 (555) 000-0000"
              {...getFieldProps("phone_number")}
              disabled={isSaving}
            />

            <div className="bg-muted/30 rounded-[1.5rem] p-5 border border-border flex flex-col justify-center h-[72px] mt-[22px]">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Email Masking</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium pl-6">
                    {values.is_email_masked ? (
                      <span className="font-bold text-primary">{initialProfile.masked_email}</span>
                    ) : (
                      initialProfile.email
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={values.is_email_masked}
                  onClick={() => setFieldValue("is_email_masked", !values.is_email_masked)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    values.is_email_masked ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-md transition-transform",
                      values.is_email_masked ? "translate-x-2.5" : "-translate-x-2.5"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Gender Identity
            </label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: "male", label: "Male" },
                { id: "female", label: "Female" },
                { id: "other", label: "Other" },
                { id: "", label: "Prefer not to say" }
              ].map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFieldValue("gender", option.id)}
                  className={cn(
                    "px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all border",
                    values.gender === option.id
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-foreground/20"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {errorVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-3xl bg-destructive/10 p-5 text-sm font-bold text-destructive flex items-center gap-3 border border-destructive/20 shadow-sm"
            >
              <AlertCircle size={18} />
              {errorVisible}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-8 flex justify-end">
          <Button
            type="submit"
            isLoading={isSaving}
            className="rounded-2xl px-12 h-14 text-sm uppercase tracking-widest font-black shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-95"
          >
            {success ? <><Check size={18} className="mr-2" /> Saved Successfully</> : "Update Profile"}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
