import { Navigate, createBrowserRouter, useParams } from "react-router-dom";

import { AppLayout } from "./ui/AppLayout";
import { ChatPage } from "./ui/ChatPage";
import { DashboardPage } from "./ui/DashboardPage";
import { HistoryPage } from "./ui/HistoryPage";
import { LandingPage } from "./ui/LandingPage";
import { MaterialsPage } from "./ui/MaterialsPage";
import { OnboardingPage } from "./ui/OnboardingPage";
import { ProjectPage } from "./ui/ProjectPage";
import { ProjectSetupPage } from "./ui/ProjectSetupPage";
import { RequireAuth } from "./ui/RequireAuth";
import { StartMaterialsPage } from "./ui/StartMaterialsPage";
import { StartMethodPage } from "./ui/StartMethodPage";
import { StartTopicPage } from "./ui/StartTopicPage";

function LegacyChatRedirect() {
  const { conversationId } = useParams();
  return <Navigate replace to={conversationId ? `/sessions/${conversationId}` : "/sessions/new"} />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/projects/:subject", element: <ProjectPage /> },
          { path: "/projects/:subject/setup", element: <ProjectSetupPage /> },
          { path: "/sessions/new", element: <ChatPage /> },
          { path: "/sessions/:conversationId", element: <ChatPage /> },
          { path: "/materials", element: <MaterialsPage /> },
          { path: "/history", element: <HistoryPage /> },
        ],
      },
      { path: "/start/topic", element: <StartTopicPage /> },
      { path: "/start/materials", element: <StartMaterialsPage /> },
      { path: "/start/method", element: <StartMethodPage /> },
      { path: "/onboarding", element: <OnboardingPage /> },
      { path: "/start", element: <Navigate replace to="/start/topic" /> },
      { path: "/sessions", element: <Navigate replace to="/sessions/new" /> },
    ],
  },
  { path: "/chat", element: <LegacyChatRedirect /> },
  { path: "/chat/:conversationId", element: <LegacyChatRedirect /> },
]);
