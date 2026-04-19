import { create } from "zustand";
import { AuthPhase, IdentityChallengePayload } from "../api/types";

interface IdentityMachineState {
  // Navigation & Phasing
  phase: AuthPhase;
  isInitializing: boolean;
  isLoading: boolean;
  error: string | null;

  // Identity Data (Kept strictly transient)
  userEmail: string;
  hitToken: string | null;
  flowId: string | null;
  expectedStep: number;
  allowedMethods: string[];
  challengeType: "select" | "mfa" | "password" | null;

  // Actions
  startFlow: (email: string) => void;
  setChallenge: (payload: IdentityChallengePayload) => void;
  setPhase: (phase: AuthPhase) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useIdentityMachine = create<IdentityMachineState>((set, get) => ({
  phase: "IDENTIFY",
  isInitializing: false,
  isLoading: false,
  error: null,

  userEmail: "",
  hitToken: null,
  flowId: null,
  expectedStep: 1,
  allowedMethods: [],
  challengeType: null,

  startFlow: (email) => 
    set({ 
      userEmail: email,
      phase: "IDENTIFY",
      isLoading: true,
      error: null 
    }),

  setChallenge: (payload) => {
    // Determine the correct phase from the backend challenge response
    let nextPhase: AuthPhase;

    if (payload.challenge_type === "select") {
      nextPhase = "METHOD_SELECT";
    } else if (payload.challenge_type === "password") {
      nextPhase = "PASSWORD_CHECK";
    } else if (payload.challenge_type === "mfa") {
      if (payload.allowed_methods.includes("totp")) {
        nextPhase = "MFA_TOTP";
      } else if (payload.allowed_methods.includes("email_otp")) {
        nextPhase = "MFA_EMAIL_OTP";
      } else {
        nextPhase = "MFA_BACKUP";
      }
    } else {
      nextPhase = "METHOD_SELECT";
    }

    set({
      hitToken: payload.hit,
      flowId: payload.flow_id,
      expectedStep: payload.expected_step,
      allowedMethods: payload.allowed_methods,
      challengeType: payload.challenge_type,
      isLoading: false,
      error: null,
      phase: nextPhase,
      userEmail: get().userEmail,
    });
  },

  setPhase: (phase) => set({ phase, error: null }),
  setError: (error) => set({ error, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),

  reset: () => set({
    phase: "IDENTIFY",
    userEmail: "",
    hitToken: null,
    flowId: null,
    expectedStep: 1,
    allowedMethods: [],
    challengeType: null,
    isLoading: false,
    error: null
  }),
}));
