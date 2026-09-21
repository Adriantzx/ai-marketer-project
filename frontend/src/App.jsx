import { Navigate, Route, Routes } from "react-router-dom";
import { getUser } from "./api.js";
import Login from "./pages/Login.jsx";
import AdminLayout from "./pages/AdminLayout.jsx";
import GmailAccess from "./pages/GmailAccess.jsx";
import PromptManagement from "./pages/PromptManagement.jsx";
import PromptTesting from "./pages/PromptTesting.jsx";
import ReportAnalysis from "./pages/ReportAnalysis.jsx";
import StudentChat from "./pages/StudentChat.jsx";

function RequireAuth({ children, admin }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !user.is_admin) return <Navigate to="/chat" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <RequireAuth admin>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="gmail" replace />} />
        <Route path="gmail" element={<GmailAccess />} />
        <Route path="prompt" element={<PromptManagement />} />
        <Route path="testing" element={<PromptTesting />} />
        <Route path="report" element={<ReportAnalysis />} />
      </Route>
      <Route
        path="/chat"
        element={
          <RequireAuth>
            <StudentChat />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
