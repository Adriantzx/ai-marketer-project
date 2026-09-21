import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Input, Space, Table, Tag, Typography, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { api, getUser } from "../api.js";

export default function GmailAccess() {
  const me = getUser()?.email;
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);

  async function load() {
    const res = await api("/api/manage-google-whitelist", { method: "POST", body: { action: "list" } });
    setUsers(res.users || []);
  }

  useEffect(() => {
    load().catch((e) => message.error(e.message));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => !s || u.email.includes(s));
  }, [users, q]);

  const admins = filtered.filter((u) => u.is_admin);
  const students = filtered.filter((u) => !u.is_admin);

  async function add() {
    try {
      await api("/api/manage-google-whitelist", {
        method: "POST",
        body: { action: "upsert", email, is_admin: false },
      });
      setEmail("");
      await load();
    } catch (e) {
      message.error(e.message);
    }
  }

  async function remove(rowEmail) {
    try {
      await api("/api/manage-google-whitelist", { method: "POST", body: { action: "delete", email: rowEmail } });
      setSelected((s) => s.filter((x) => x !== rowEmail));
      await load();
    } catch (e) {
      message.error(e.message === "cannot_delete_self" ? "You cannot delete your own account." : e.message);
    }
  }

  function columns() {
    return [
      {
        title: "",
        width: 48,
        render: (_, row) => (
          <Checkbox
            checked={selected.includes(row.email)}
            onChange={(e) => {
              setSelected((s) => (e.target.checked ? [...s, row.email] : s.filter((x) => x !== row.email)));
            }}
          />
        ),
      },
      { title: "Email", dataIndex: "email" },
      {
        title: "Admin",
        width: 120,
        render: (_, row) =>
          row.is_admin ? <Tag color="gold">Admin</Tag> : <Tag>Student</Tag>,
      },
      {
        title: "Action",
        width: 100,
        render: (_, row) => (
          <Button
            type="link"
            className="delete-link"
            disabled={row.email === me}
            onClick={() => remove(row.email)}
          >
            DELETE
          </Button>
        ),
      },
    ];
  }

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Gmail Access
      </Typography.Title>
      <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
        <Input placeholder="Enter Google email..." value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="primary" onClick={add}>
          Add
        </Button>
      </Space.Compact>
      <Space.Compact style={{ width: "100%", marginBottom: 24 }}>
        <Input placeholder="Search email..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Button icon={<SearchOutlined />} />
      </Space.Compact>
      {selected.length > 0 && (
        <Button danger type="link" onClick={() => selected.forEach(remove)} style={{ paddingLeft: 0 }}>
          DELETE SELECTED
        </Button>
      )}
      <Typography.Title level={5}>Admin Accounts ({admins.length})</Typography.Title>
      <Table rowKey="email" pagination={false} columns={columns()} dataSource={admins} size="middle" />
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Student Accounts ({students.length})
      </Typography.Title>
      <Table rowKey="email" pagination={false} columns={columns()} dataSource={students} size="middle" />
    </div>
  );
}
