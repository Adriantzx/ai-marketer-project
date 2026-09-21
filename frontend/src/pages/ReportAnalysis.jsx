import { useEffect, useState } from "react";
import { Button, Col, DatePicker, Input, Modal, Row, Select, Space, Table, Tag, Typography, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { api } from "../api.js";

function Stat({ label, value }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Bars({ title, items }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      {items.length === 0 && <div style={{ color: "#9ca3af", marginTop: 24 }}>No Data</div>}
      {items.map((i) => (
        <div key={i.key} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{i.key}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <div style={{ textAlign: "right", fontSize: 12 }}>{i.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReportAnalysis() {
  const [range, setRange] = useState(null);
  const [bot, setBot] = useState();
  const [bots, setBots] = useState([]);
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);

  async function load() {
    const res = await api("/api/admin-report-analysis", {
      method: "POST",
      body: {
        action: "summary",
        date_from: range?.[0]?.toDate?.().toISOString(),
        date_to: range?.[1]?.toDate?.().toISOString(),
        chatbot_key: bot || null,
      },
    });
    setData(res);
  }

  useEffect(() => {
    api("/api/manage-system-prompt", { method: "POST", body: { action: "list" } })
      .then((r) => setBots(r.chatbots))
      .catch((e) => message.error(e.message));
  }, []);

  useEffect(() => {
    load().catch((e) => message.error(e.message));
  }, []);

  const o = data?.overview || {};
  const recent = (data?.recent_conversations || []).filter(
    (r) => !q || r.user_email?.includes(q) || r.title?.includes(q)
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Report Analysis
        </Typography.Title>
        <Space>
          <DatePicker.RangePicker value={range} onChange={setRange} />
          <Select
            allowClear
            placeholder="All Chatbots"
            style={{ minWidth: 180 }}
            value={bot}
            onChange={setBot}
            options={bots.map((b) => ({ value: b.key, label: b.name }))}
          />
          <Button type="primary" onClick={load}>
            Refresh
          </Button>
        </Space>
      </div>
      <Typography.Text type="secondary">Overview</Typography.Text>
      <Row gutter={24} style={{ margin: "12px 0 24px" }}>
        <Col span={5}><Stat label="Total Conversations" value={o.conversations ?? 0} /></Col>
        <Col span={4}><Stat label="Unique Users" value={o.unique_users ?? 0} /></Col>
        <Col span={5}><Stat label="Total Messages" value={o.messages ?? 0} /></Col>
        <Col span={5}><Stat label="Active Conversations" value={o.active_conversations ?? 0} /></Col>
        <Col span={5}><Stat label="Avg Insight Score" value={(o.average_insight_score ?? 0).toFixed?.(1) || o.average_insight_score || 0} /></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Typography.Text strong>Operational Metrics</Typography.Text>
          {[
            ["Tracked AI Responses", o.tracked_ai_responses],
            ["Input Tokens", o.input_tokens],
            ["Output Tokens", o.output_tokens],
            ["Avg Response Time (ms)", o.average_response_ms],
            ["Identity Guard Hits", o.identity_guard_hits],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
              <span>{k}</span>
              <span>{v ?? 0}</span>
            </div>
          ))}
        </Col>
        <Col span={8}>
          <Bars title="Stage Distribution" items={data?.stage_distribution || []} />
        </Col>
        <Col span={8}>
          <Bars title="Status Distribution" items={data?.status_distribution || []} />
        </Col>
      </Row>
      <Typography.Title level={5}>Chatbot Performance</Typography.Title>
      <Table
        rowKey="chatbot_key"
        pagination={false}
        size="small"
        dataSource={data?.chatbot_performance || []}
        columns={[
          { title: "Chatbot Name", dataIndex: "name" },
          { title: "Current Model", dataIndex: "model" },
          { title: "Latest Prompt Version", dataIndex: "prompt_version" },
          { title: "Total Conversations", dataIndex: "conversations" },
          { title: "Total Messages", dataIndex: "messages" },
          { title: "Insight Score", dataIndex: "avg_insight" },
          { title: "Tracked AI Responses", dataIndex: "ai_replies" },
          {
            title: "Tokens (In/Out)",
            render: (_, r) => `${r.input_tokens} / ${r.output_tokens}`,
          },
          { title: "Avg Response Time (ms)", dataIndex: "avg_ms" },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Gmail Activity
      </Typography.Title>
      <Table
        rowKey="email"
        size="small"
        pagination={{ pageSize: 10 }}
        dataSource={data?.gmail_activity || []}
        columns={[
          {
            title: "Email",
            dataIndex: "email",
            render: (v, r, i) => (
              <span>
                {v} {i === 0 && r.messages > 0 ? <Tag color="gold">Most Active</Tag> : null}
              </span>
            ),
          },
          { title: "Conversations", dataIndex: "conversations" },
          { title: "Messages", dataIndex: "messages" },
          { title: "Last Active", dataIndex: "last_active" },
        ]}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Recent Conversations
        </Typography.Title>
        <Input prefix={<SearchOutlined />} placeholder="Search" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Table
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10 }}
        dataSource={recent}
        columns={[
          { title: "Email", dataIndex: "user_email" },
          { title: "Chatbot Name", dataIndex: "chatbot_name" },
          { title: "Title", dataIndex: "title" },
          { title: "Stage", dataIndex: "stage" },
          { title: "Status", dataIndex: "status" },
          { title: "Insight Score", dataIndex: "insight_score" },
          { title: "Message Count", dataIndex: "message_count" },
          { title: "Updated Date", dataIndex: "updated_at", render: (v) => v?.slice(0, 10) },
          {
            title: "Action",
            render: (_, r) => (
              <Button
                type="link"
                onClick={async () => {
                  const d = await api("/api/admin-report-analysis", {
                    method: "POST",
                    body: { action: "conversation_detail", conversation_id: r.id },
                  });
                  setDetail(d);
                }}
              >
                View
              </Button>
            ),
          },
        ]}
      />
      <Modal open={!!detail} onCancel={() => setDetail(null)} footer={null} title={detail?.conversation?.title} width={720}>
        {(detail?.messages || []).map((m) => (
          <p key={m.id}>
            <strong>{m.role}</strong> ({m.input_tokens || 0}/{m.output_tokens || 0} tok)
            <br />
            {m.content}
          </p>
        ))}
      </Modal>
    </div>
  );
}
