import { Navigate, createBrowserRouter } from "react-router-dom";

import { AuthPage } from "@/modules/auth/pages/AuthPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { AuthShell } from "@/shared/ui/AuthShell";

import { ProfileSection } from "@/features/settings/ui/ProfileSection";
import { PrivacySection } from "@/features/settings/ui/PrivacySection";
import { SecuritySection } from "@/features/settings/ui/SecuritySection";
import { ActiveSessionsSection } from "@/features/settings/ui/ActiveSessionsSection";

import { ContactsLayout } from "@/features/contacts/ui/ContactsLayout";
import { ContactsPage } from "@/features/contacts/ui/ContactsPage";
import { RequestsPage } from "@/features/contacts/ui/RequestsPage";
import { DiscoverySearch } from "@/features/contacts/ui/DiscoverySearch";
import { UserProfilePage } from "@/features/contacts/ui/UserProfilePage";
import { ChatPage } from "@/features/chat/ui/ChatPage";

import { MainAppLayout } from "@/app/MainAppLayout";
import { SettingsLayout } from "@/pages/SettingsPage";

import {
  AuthenticatedGuard,
  GuestGuard,
  RootRedirect
} from "@/shared/auth/guards";

export const appRouter = createBrowserRouter([
  // Auth Routes
  {
    element: (
      <GuestGuard>
        <AuthShell />
      </GuestGuard>
    ),
    errorElement: <ErrorPage />,
    children: [
      { path: "/auth", element: <AuthPage /> },
    ],
  },
  
  // App Routes (Root Level)
  {
    path: "/",
    errorElement: <ErrorPage />,
    element: (
      <AuthenticatedGuard>
        <MainAppLayout />
      </AuthenticatedGuard>
    ),
    children: [
      { index: true, element: <RootRedirect /> },
      { path: "chats/:roomId?", element: <ChatPage /> },
      {
        path: "contacts",
        element: <ContactsLayout />,
        children: [
          { index: true, element: <ContactsPage /> },
          { path: "requests", element: <RequestsPage /> },
          { path: "discovery", element: <DiscoverySearch /> },
          { path: "profile/:userId", element: <UserProfilePage /> },
        ]
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { path: "profile", element: <ProfileSection /> },
          { path: "privacy", element: <PrivacySection /> },
          { path: "security", element: <SecuritySection /> },
          { path: "devices", element: <ActiveSessionsSection /> },
          { path: "notifications", element: <div className="p-20 text-center font-bold text-muted-foreground/30 uppercase tracking-widest text-xs">Access Restricted • Coming Soon</div> },
          { index: true, element: <Navigate to="/settings/profile" replace /> },
        ],
      },
    ],
  },

  // Global Redirects for ease of use
  { path: "/login", element: <Navigate to="/auth?mode=login" replace /> },
  { path: "/signup", element: <Navigate to="/auth?mode=signup" replace /> },
]);
