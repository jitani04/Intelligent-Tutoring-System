import { Navigate, createBrowserRouter, useParams } from "react-router-dom";

import { AppShell } from "./ui/AppShell";
import { ChatPage } from "./ui/ChatPage";
import { HistoryPage } from "./ui/HistoryPage";
import { LandingPage } from "./ui/LandingPage";
import { MaterialsPage } from "./ui/MaterialsPage";
import { StartMaterialsPage } from "./ui/StartMaterialsPage";
import { StartMethodPage } from "./ui/StartMethodPage";
import { StartTopicPage } from "./ui/StartTopicPage";

function LegacyChatRedirect() {
  const { conversationId } = useParams();
  return <Navigate replace to={conversationId ? `/sessions/${conversationId}` : "/sessions"} />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/start",
    element: <Navigate replace to="/start/topic" />,
  },
  {
    path: "/start/topic",
    element: <StartTopicPage />,
  },
  {
    path: "/start/materials",
    element: <StartMaterialsPage />,
  },
  {
    path: "/start/method",
    element: <StartMethodPage />,
  },
  {
    path: "/sessions",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <ChatPage />,
      },
      {
        path: "new",
        element: <ChatPage />,
      },
      {
        path: ":conversationId",
        element: <ChatPage />,
      },
    ],
  },
  {
    path: "/materials",
    element: <MaterialsPage />,
  },
  {
    path: "/history",
    element: <HistoryPage />,
  },
  {
    path: "/chat",
    element: <LegacyChatRedirect />,
  },
  {
    path: "/chat/:conversationId",
    element: <LegacyChatRedirect />,
  },
]);
