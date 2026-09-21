import { useContext, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button, Input, Select, Space, message } from "antd";
import { PaperClipOutlined, AudioOutlined, SendOutlined } from "@ant-design/icons";
import { api } from "../api.js";
import { LocaleContext } from "../locale.jsx";

export default function PromptTesting() {
  const locale = useContext(LocaleContext);
  const [bots, setBots] = useState([]);
  const [models, setModels] = useState([]);
  const [key, setKey] = useState();
  const [model, setModel] = useState();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [improve, setImprove] = useState("");
  const [loading, setLoading] = useState(false);
  const newChatAbort = useRef(null);
  const newChatTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const [b, m] = await Promise.all([
        api("/api/manage-system-prompt", { method: "POST", body: { action: "list" } }),
        api("/api/manage-system-prompt", { method: "POST", body: { action: "models" } }),
      ]);
      setBots(b.chatbots);
      setModels(m.models);
      setKey(b.chatbots[0]?.key);
      setModel(b.chatbots[0]?.model);
    })().catch((e) => message.error(e.message));
  }, []);

  async function runTest(chatbotKey, testModel, history, signal) {
    return api("/api/test-system-prompt", {
      method: "POST",
      signal,
      body: {
        action: "test",
        chatbot_key: chatbotKey,
        model: testModel,
        prompt_locale: locale,
        messages: history,
      },
    });
  }

  async function newChat() {
    if (!key) return;
    newChatAbort.current?.abort();
    const ac = new AbortController();
    newChatAbort.current = ac;
    const t0 = Date.now();
    const thinkingHoldMs = 4000 + Math.floor(Math.random() * 2001);
    flushSync(() => {
      setLoading(true);
      setMessages([{ role: "assistant", content: "Thinking...", pending: true }]);
    });
    try {
      const res = await runTest(key, model, [], ac.signal);
      if (ac.signal.aborted) return;
      const waitMs = Math.max(0, thinkingHoldMs - (Date.now() - t0));
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      if (ac.signal.aborted) return;
      setMessages([res.message]);
    } catch (e) {
      if (e.name === "AbortError") return;
      message.error(e.message);
      setMessages([]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    if (!key || !model) return;
    clearTimeout(newChatTimer.current);
    newChatTimer.current = setTimeout(() => newChat(), 50);
    return () => {
      clearTimeout(newChatTimer.current);
      newChatAbort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locale]);

  async function send() {
    if (!text.trim()) return;
    const next = [...messages, { role: "user", content: text.trim() }];
    setText("");
    setMessages(next);
    setLoading(true);
    try {
      const res = await runTest(key, model, next);
      setMessages([...next, res.message]);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runImprove() {
    if (!improve.trim()) return;
    const res = await api("/api/test-system-prompt", {
      method: "POST",
      body: {
        action: "improve",
        chatbot_key: key,
        model,
        prompt_locale: locale,
        feedback: improve,
        moduleContent: messages.at(-1)?.content,
      },
    });
    message.success("Suggestion generated");
    setMessages((m) => [...m, { role: "assistant", content: res.suggestion }]);
  }

  return (
    <div className="testing-page">
      <div className="testing-toolbar">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Prompt Testing</h2>
        <Space>
          <Select style={{ minWidth: 200 }} value={key} options={bots.map((b) => ({ value: b.key, label: b.name }))} onChange={setKey} />
          <Input disabled value="Test model (testing only)" style={{ width: 180, color: "#9ca3af" }} />
          <Select style={{ minWidth: 180 }} value={model} options={models.map((m) => ({ value: m.value, label: m.label }))} onChange={setModel} />
          <Button type="primary" onClick={newChat} loading={loading}>
            New Test Chat
          </Button>
        </Space>
      </div>
      <div className="testing-thread">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg-row user">
              <div className="user-pill">{m.content}</div>
              <div className="user-avatar">A</div>
            </div>
          ) : (
            <div key={i} className="msg-row assistant">
              <div className="kael-avatar">K</div>
              <div className="msg-body" style={m.pending ? { color: "#9ca3af" } : undefined}>
                {m.content}
              </div>
            </div>
          )
        )}
      </div>
      <div className="testing-footer">
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <span style={{ color: "#9ca3af", fontSize: 13, width: 80 }}>AI Improve</span>
            <Input
              placeholder="What should be improved about the response?"
              value={improve}
              onChange={(e) => setImprove(e.target.value)}
              style={{ flex: 1, background: "#fff" }}
            />
            <Button onClick={runImprove}>Improve with AI</Button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPressEnter={send}
              style={{ flex: 1, borderRadius: 24, background: "#fff" }}
              suffix={
                <Space>
                  <PaperClipOutlined style={{ color: "#9ca3af" }} />
                  <AudioOutlined style={{ color: "#9ca3af" }} />
                </Space>
              }
            />
            <Button type="primary" shape="circle" icon={<SendOutlined />} loading={loading} onClick={send} />
          </div>
        </div>
      </div>
    </div>
  );
}
