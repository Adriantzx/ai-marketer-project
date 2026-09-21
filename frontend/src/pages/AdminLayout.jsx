import { useState } from "react";
import { Avatar, Button, Dropdown, Typography } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../api.js";
import { LocaleContext } from "../locale.jsx";

const NAV = [
  { to: "/admin/gmail", label: "Gmail Access" },
  { to: "/admin/prompt", label: "AI Prompt" },
  { to: "/admin/testing", label: "Prompt Testing" },
  { to: "/admin/report", label: "Report Analysis" },
];

export default function AdminLayout() {
  const user = getUser();
  const loc = useLocation();
  const navigate = useNavigate();
  const [locale, setLocale] = useState("en-MY");
  const email = user?.email || "";
  const initial = (email[0] || "A").toUpperCase();
  const short = email.length > 14 ? `${email.slice(0, 13)}…` : email;
  const flush = loc.pathname.startsWith("/admin/testing");

  return (
    <LocaleContext.Provider value={locale}>
      <div className="admin-app">
        <header className="admin-header">
          <div className="admin-brand">
            <span className="admin-k">K.</span>
            <Typography.Text>Joanne AI Admin</Typography.Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Dropdown
              menu={{
                items: [
                  { key: "en-MY", label: "English" },
                  { key: "zh-MY", label: "中文" },
                ],
                onClick: ({ key }) => setLocale(key),
              }}
            >
              <Button type="text">{locale === "zh-MY" ? "中文" : "English"}</Button>
            </Dropdown>
            <Avatar style={{ background: "#d97706" }}>{initial}</Avatar>
            <Typography.Text>{short}</Typography.Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => {
                clearSession();
                navigate("/login");
              }}
            >
              Logout
            </Button>
          </div>
        </header>
        <div className="admin-body">
          <nav className="admin-sider">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <main className={flush ? "admin-main admin-main--flush" : "admin-main"}>
            {flush ? <Outlet /> : <div className="admin-card">{<Outlet />}</div>}
          </main>
        </div>
      </div>
    </LocaleContext.Provider>
  );
}
