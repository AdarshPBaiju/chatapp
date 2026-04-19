import { useState } from "react";
import { Lock, CheckCircle, ShieldAlert } from "lucide-react";

import { changePassword } from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Modal } from "@/shared/ui/Modal";
import { toast } from "@/shared/ui/Toast";
import { Button, Input } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const { getFieldProps, handleSubmit, setErrors, setFieldValue } = useForm({
    initialValues: {
      oldPassword: "",
      password: "",
      confirmPassword: "",
    },
    schema: {
      oldPassword: v.string().required("Current password is required"),
      password: v.string().min(8, "Minimum 8 characters").required("New password is required"),
      confirmPassword: v.string().matches("password", "New passwords do not match").required("Please confirm your new password")
    },
    onSubmit: async (formValues) => {
      setLoading(true);
      try {
        await changePassword({
          old_password: formValues.oldPassword,
          password: formValues.password,
          confirm_password: formValues.confirmPassword,
        });
        toast.success("Password changed successfully.");
        setSuccess(true);
      } catch (err) {
        const msg = readApiMessage(err, "Failed to change password.");
        toast.error(msg);
        setErrors({ confirmPassword: msg });
      } finally {
        setLoading(false);
      }
    }
  });

  function handleClose() {
    // Reset state before closing
    if (success) {
        setFieldValue("oldPassword", "");
        setFieldValue("password", "");
        setFieldValue("confirmPassword", "");
        setSuccess(false);
    }
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Change Password" maxWidth="md">
      {success ? (
        <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-success/20 bg-success/5 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 shadow-sm">
              <CheckCircle className="text-success" size={24} />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-foreground">Password Updated</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Your new security credentials are now active.</p>
            </div>
          </div>
          <Button compact onClick={handleClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-6 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-primary/10 bg-primary/5 p-3">
            <ShieldAlert className="shrink-0 text-primary mt-0.5" size={18} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Confirm your identity with your current password.
            </p>
          </div>

          <Input
            compact
            type="password"
            label="Current Password"
            placeholder="Account password"
            icon={<Lock size={16} />}
            {...getFieldProps("oldPassword")}
            disabled={loading}
          />

          <div className="space-y-4 pt-1">
            <Input
              compact
              type="password"
              label="New Password"
              placeholder="Min 8 chars"
              icon={<Lock size={16} />}
              {...getFieldProps("password")}
              disabled={loading}
            />

            <Input
              compact
              type="password"
              label="Confirm New Password"
              placeholder="Repeat password"
              icon={<Lock size={16} />}
              {...getFieldProps("confirmPassword")}
              disabled={loading}
            />
          </div>

          <Button compact type="submit" className="w-full" isLoading={loading}>
             Update Credentials
          </Button>
        </form>
      )}
    </Modal>
  );
}
