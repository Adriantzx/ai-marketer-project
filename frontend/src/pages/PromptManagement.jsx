import { useEffect, useState } from "react";
import { Button, Card, Col, Input, List, Row, Select, Space, Typography, message } from "antd";
import { api } from "../api.js";

export default function PromptManagement() {
  const [bots, setBots] = useState([]);
  const [models, setModels] = useState([]);
  const [key, setKey] = useState();
  const [locale, setLocale] = useState("zh-MY");
  const [name, setName] = useState("");
  const [model, setModel] = useState();
  const [modules, setModules] = useState([]);
  const [stages, setStages] = useState([]);
  const [selected, setSelected] = useState();
  const [content, setContent] = useState("");
  const [stageKey, setStageKey] = useState();
  const [preview, setPreview] = useState("");
  const [history, setHistory] = useState([]);

  const current = modules.find((m) => m.module_key === selected);

  async function bootstrap() {
    const [b, m] = await Promise.all([
      api("/api/manage-system-prompt", { method: "POST", body: { action: "list" } }),
      api("/api/manage-system-prompt", { method: "POST", body: { action: "models" } }),
    ]);
    setBots(b.chatbots);
    setModels(m.models);
    const first = b.chatbots[0];
    if (first) {
      setKey(first.key);
      setName(first.name);
      setModel(first.model);
    }
  }

  async function loadModules(chatbotKey, loc) {
    const [mods, st] = await Promise.all([
      api("/api/manage-system-prompt", { method: "POST", body: { action: "modules", chatbot_key: chatbotKey, prompt_locale: loc } }),
      api("/api/manage-system-prompt", { method: "POST", body: { action: "stages", chatbot_key: chatbotKey, prompt_locale: loc } }),
    ]);
    setModules(mods.modules || []);
    setStages(st.stages || []);
    const first = mods.modules?.[0];
    setSelected(first?.module_key);
    setContent(first?.content || "");
    setStageKey(undefined);
    setPreview("");
  }

  useEffect(() => {
    bootstrap().catch((e) => message.error(e.message));
  }, []);

  useEffect(() => {
    if (key) loadModules(key, locale).catch((e) => message.error(e.message));
  }, [key, locale]);

  function pickModule(mod) {
    setSelected(mod.module_key);
    setContent(mod.content);
  }

  async function saveBot() {
    await api("/api/manage-system-prompt", {
      method: "POST",
      body: { action: "update_metadata", chatbot_key: key, name, model },
    });
    const b = await api("/api/manage-system-prompt", { method: "POST", body: { action: "list" } });
    setBots(b.chatbots);
    message.success("Bot info saved");
  }

  async function saveModule() {
    const res = await api("/api/manage-system-prompt", {
      method: "POST",
      body: {
        action: "update_module",
        chatbot_key: key,
        module_key: selected,
        prompt_locale: locale,
        content,
      },
    });
    setModules((rows) => rows.map((m) => (m.module_key === selected ? res.module : m)));
    message.success("Module saved");
  }

  async function loadPreview(sk) {
    setStageKey(sk);
    if (!sk) return setPreview("");
    const res = await api("/api/manage-system-prompt", {
      method: "POST",
      body: { action: "compiled_preview", chatbot_key: key, prompt_locale: locale, stage_key: sk },
    });
    setPreview(res.compiled || "");
  }

  async function loadHistory() {
    const res = await api("/api/manage-system-prompt", {
      method: "POST",
      body: { action: "module_history", chatbot_key: key, module_key: selected, prompt_locale: locale },
    });
    setHistory(res.history || []);
    message.info(res.history?.length ? `${res.history.length} previous version(s)` : "No history yet");
  }

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        AI Prompt Management
      </Typography.Title>
      <Row gutter={12} align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <span>Select Chatbot</span>
            <Select
              style={{ minWidth: 220 }}
              value={key}
              options={bots.map((b) => ({ value: b.key, label: b.name }))}
              onChange={(v) => {
                const b = bots.find((x) => x.key === v);
                setKey(v);
                setName(b?.name || "");
                setModel(b?.model);
              }}
            />
          </Space>
        </Col>
        <Col>
          <Space>
            <span>Chatbot Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
          </Space>
        </Col>
        <Col>
          <Space>
            <span>Model</span>
            <Select style={{ minWidth: 180 }} value={model} options={models.map((m) => ({ value: m.value, label: m.label }))} onChange={setModel} />
          </Space>
        </Col>
        <Col>
          <Select value={locale} onChange={setLocale} options={[{ value: "zh-MY", label: "zh-MY" }, { value: "en-MY", label: "en-MY" }]} />
        </Col>
        <Col flex="auto" style={{ textAlign: "right" }}>
          <Button type="primary" onClick={saveBot}>
            Save Bot Info
          </Button>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Card title="Included Modules" size="small" bodyStyle={{ padding: 0, maxHeight: "70vh", overflow: "auto" }}>
            <List
              dataSource={modules}
              renderItem={(item) => (
                <List.Item
                  onClick={() => pickModule(item)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: item.module_key === selected ? "#f3f4f6" : "#fff",
                    borderLeft: item.module_key === selected ? "3px solid #1f2937" : "3px solid transparent",
                  }}
                >
                  <div style={{ width: "100%" }}>
                    <div>{item.display_name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: 12 }}>
                      <span>{item.type}</span>
                      <span>v{item.version}</span>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={16}>
          <Card
            title={current?.display_name || "Module"}
            extra={<Button onClick={loadHistory}>Module History</Button>}
            size="small"
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {current?.description}
              <br />
              Module Key: {current?.module_key} &nbsp; Version: {current?.version} &nbsp; Last Updated:{" "}
              {current?.updated_at ? new Date(current.updated_at).toLocaleString() : "—"}
            </Typography.Paragraph>
            <Input.TextArea value={content} onChange={(e) => setContent(e.target.value)} autoSize={{ minRows: 16, maxRows: 28 }} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <Button type="primary" onClick={saveModule} disabled={!selected}>
                Save Current Module
              </Button>
            </div>
            {history.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                History: {history.map((h) => `v${h.version}`).join(", ")}
              </Typography.Paragraph>
            )}
          </Card>
          <Card title="Stage Compilation Preview" size="small" style={{ marginTop: 16 }}>
            <Space style={{ marginBottom: 12 }}>
              <span>Select Stage</span>
              <Select
                placeholder="Select Stage"
                allowClear
                style={{ minWidth: 200 }}
                value={stageKey}
                options={stages.map((s) => ({ value: s.stage_key, label: s.display_name }))}
                onChange={loadPreview}
              />
            </Space>
            {preview ? (
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", fontSize: 12 }}>{preview}</pre>
            ) : (
              <Typography.Text type="secondary">No Data</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
