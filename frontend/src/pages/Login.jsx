import { useState } from "react";
import { Button, Card, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../api.js";

export default function Login() {
  const [email, setEmail] = useState("adriantzx2511@gmail.com");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function requestOtp() {
    setLoading(true);
    try {
      const res = await api("/api/auth/otp/request", { method: "POST", body: { email } });
      setSent(true);
      setDevOtp(res.dev_otp || "");
      if (res.dev_otp) setCode(res.dev_otp);
      message.success("Code sent (local: shown below). OTP will not create new users.");
    } catch (e) {
      message.error(e.message === "unauthorizedGoogle" ? "This Google email is not on the whitelist." : e.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    try {
      const res = await api("/api/auth/otp/verify", { method: "POST", body: { email, code } });
      setSession(res.token, res.user);
      navigate(res.user.is_admin ? "/admin/gmail" : "/chat");
    } catch (e) {
      message.error("Invalid code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <Card style={{ width: 420 }} title="Coach Joanne K. AI">
        <Typography.Paragraph type="secondary">
          Email login for an existing whitelist account only. Google SSO is not wired in this local rebuild.
        </Typography.Paragraph>
        <Input placeholder="Google email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 12 }} />
        {sent && (
          <Input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} style={{ marginBottom: 12 }} maxLength={6} />
        )}
        {devOtp && (
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            Dev OTP: {devOtp}
          </Typography.Text>
        )}
        {!sent ? (
          <Button type="primary" block loading={loading} onClick={requestOtp}>
            Email login
          </Button>
        ) : (
          <Button type="primary" block loading={loading} onClick={verify}>
            Verify code
          </Button>
        )}
      </Card>
    </div>
  );
}
