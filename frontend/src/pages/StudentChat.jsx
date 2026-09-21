import { useEffect, useState } from "react";
import { Avatar, Button, Input, Layout, List, Select, Space, Typography, message } from "antd";
import { LogoutOutlined, SendOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, clearSession, getUser } from "../api.js";

export default function StudentChat() {
  const user = getUser();
  const navigate = useNavigate();
  const [bots, setBots] = useState([]);
  const [bot, setBot] = useState();
  const [locale, setLocale] = useState("zh-MY");
  const [convos, setConvos] = useState([]);
  const [current, setCurrent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadBots() {
    const res = await api("/api/chatbots");
    setBots(res.chatbots || []);
    setBot(res.chatbots?.[0]?.key);
  }

  async function loadConvos() {
    const res = await api("/api/conversations");
    setConvos(res.conversations || []);
  }

  useEffect(() => {
    loadBots();
    loadConvos().catch((e) => message.error(e.message));
  }, []);

  async function openConvo(id) {
    const res = await api(`/api/conversations/${id}/messages`);
    setCurrent(res.conversation);
    setMessages(res.messages || []);
  }

  async function start() {
    const created = await api("/api/create-conversation", {
      method: "POST",
      body: { chatbot_key: bot, prompt_locale: locale },
    });
    const conv = created.conversation;
    const gen = await api("/api/generate-ai-response", {
      method: "POST",
      body: { conversation_id: conv.id, messages: [], mode: "initial", respond_async: false },
    });
    await loadConvos();
    setCurrent(gen.conversation);
    setMessages([gen.message]);
  }

  async function send() {
    if (!current || !text.trim()) return;
    const payload = messages.map((m) => ({ role: m.role, content: m.content }));
    const content = text.trim();
    setText("");
    setMessages((m) => [...m, { role: "user", content }]);
    setLoading(true);
    try {
      const gen = await api("/api/generate-ai-response", {
        method: "POST",
        body: {
          conversation_id: current.id,
          messages: [...payload, { role: "user", content }],
          content,
          respond_async: false,
        },
      });
      setMessages((m) => [...m, gen.message]);
      setCurrent(gen.conversation);
      await loadConvos();
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout style={{ minHeight: "100%" }}>
      <Layout.Header style={{ background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography.Text strong>Coach Joanne K. AI</Typography.Text>
        <Space>
          {user?.is_admin && <Button onClick={() => navigate("/admin/gmail")}>Joanne AI Admin</Button>}
          <span>{user?.email}</span>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            Logout
          </Button>
        </Space>
      </Layout.Header>
      <Layout>
        <Layout.Sider width={280} theme="light" style={{ padding: 16, borderRight: "1px solid #f0f0f0" }}>
          <Select style={{ width: "100%", marginBottom: 8 }} value={bot} options={bots.map((b) => ({ value: b.key, label: b.name }))} onChange={setBot} />
          <Select style={{ width: "100%", marginBottom: 8 }} value={locale} options={[{ value: "zh-MY", label: "中文" }, { value: "en-MY", label: "English" }]} onChange={setLocale} />
          <Button type="primary" block onClick={start} style={{ marginBottom: 16 }}>
            New chat
          </Button>
          <List
            dataSource={convos}
            renderItem={(c) => (
              <List.Item onClick={() => openConvo(c.id)} style={{ cursor: "pointer", background: current?.id === c.id ? "#fffbeb" : undefined }}>
                <List.Item.Meta title={c.title} description={c.chatbot_key} />
              </List.Item>
            )}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24, background: "#fff" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", minHeight: "60vh" }}>
            {messages.map((m) => (
              <div key={m.id || m.content} className="kael-bubble" style={{ display: "flex", gap: 12 }}>
                {m.role !== "user" && <Avatar style={{ background: "#111827" }}>K</Avatar>}
                <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
              </div>
            ))}
          </div>
          <Space.Compact style={{ width: "100%", maxWidth: 720, margin: "24px auto 0", display: "flex" }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} onPressEnter={send} placeholder="Type a message..." disabled={!current} />
            <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={send} disabled={!current} />
          </Space.Compact>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
