import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: { colorPrimary: "#1f2937", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" },
        components: {
          Menu: {
            itemSelectedColor: "#d97706",
            itemSelectedBg: "#fffbeb",
            itemHoverBg: "#fffbeb",
            itemBg: "#ffffff",
          },
          Layout: { headerBg: "#ffffff", siderBg: "#ffffff", bodyBg: "#f5f5f5" },
          Button: { primaryColor: "#fff" },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
