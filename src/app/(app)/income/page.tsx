"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { BankOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";

type Collection = {
  id: string;
  amount: number;
  advance_applied: number;
  paid_at: string;
  month: string;
  rooms: { kind: "room" | "shop"; room_number: string } | null;
};
type Transfer = { id: string; amount: number; transfer_date: string; note: string | null };
type Expense = { id: string; amount: number; expense_date: string; note: string };
type AdvanceReturn = {
  id: string;
  kind: "refund" | "applied";
  room_label: string;
  amount: number;
  return_date: string;
  note: string | null;
};
type MonthRow = {
  key: string;
  month: string;
  opening: number;
  collected: number;
  bank: number;
  spent: number;
  closing: number;
};
type TransferValues = { amount: number; transfer_date: Dayjs; note?: string };

const fmt = (v: number | string) => Number(v).toLocaleString();

export default function IncomePage() {
  const { message } = App.useApp();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [returns, setReturns] = useState<AdvanceReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<TransferValues>();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [c, t, x, r] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, advance_applied, paid_at, month, rooms(kind, room_number)")
        .order("paid_at", { ascending: false })
        .overrideTypes<Collection[]>(),
      supabase
        .from("bank_transfers")
        .select("id, amount, transfer_date, note")
        .order("transfer_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("expenses")
        .select("id, amount, expense_date, note")
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("advance_returns")
        .select("id, kind, room_label, amount, return_date, note")
        .order("return_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    const err = c.error ?? t.error ?? x.error ?? r.error;
    if (err) message.error(err.message);
    setCollections(c.data ?? []);
    setTransfers(t.data ?? []);
    setExpenses(x.data ?? []);
    setReturns(r.data ?? []);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Rent income = cash received + the part settled from the tenant's advance.
  const rentOf = (c: Collection) => Number(c.amount) + Number(c.advance_applied);
  const collected = collections.reduce((s, c) => s + rentOf(c), 0);
  const inBank = transfers.reduce((s, t) => s + Number(t.amount), 0);
  const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  // Advance is security money held separately, so it is not part of cash on hand.
  const cash = collected - inBank - spent;

  // Month-by-month cash book: opening + collected - to bank - expenses = closing, carried forward.
  const monthly = (() => {
    const inMonth = (rows: { d: string; amount: number }[]) => {
      const m = new Map<string, number>();
      rows.forEach(({ d, amount }) => {
        const k = dayjs(d).format("YYYY-MM");
        m.set(k, (m.get(k) ?? 0) + Number(amount));
      });
      return m;
    };
    const col = inMonth(collections.map((c) => ({ d: c.paid_at, amount: rentOf(c) })));
    const tr = inMonth(transfers.map((t) => ({ d: t.transfer_date, amount: t.amount })));
    const ex = inMonth(expenses.map((e) => ({ d: e.expense_date, amount: e.amount })));
    const keys = [...col.keys(), ...tr.keys(), ...ex.keys()].sort();
    if (!keys.length) return [];
    const rows: MonthRow[] = [];
    let opening = 0;
    for (let m = dayjs(keys[0] + "-01"); !m.isAfter(dayjs(), "month"); m = m.add(1, "month")) {
      const k = m.format("YYYY-MM");
      const collectedM = col.get(k) ?? 0;
      const bankM = tr.get(k) ?? 0;
      const spentM = ex.get(k) ?? 0;
      const closing = opening + collectedM - bankM - spentM;
      rows.push({
        key: k,
        month: m.format("MMMM YYYY"),
        opening,
        collected: collectedM,
        bank: bankM,
        spent: spentM,
        closing,
      });
      opening = closing;
    }
    return rows.reverse();
  })();

  async function transfer(values: TransferValues) {
    setSaving(true);
    const { error } = await createClient()
      .from("bank_transfers")
      .insert({
        amount: values.amount,
        transfer_date: values.transfer_date.format("YYYY-MM-DD"),
        note: values.note?.trim() || null,
      });
    setSaving(false);
    if (error) return message.error(error.message);
    message.success(`${fmt(values.amount)} transferred to bank`);
    setOpen(false);
    form.resetFields();
    load();
  }

  async function removeTransfer(id: string) {
    const { error } = await createClient().from("bank_transfers").delete().eq("id", id);
    if (error) return message.error(error.message);
    message.success("Transfer deleted, cash restored");
    load();
  }

  const amountRules = [
    { required: true, message: "Enter amount" },
    {
      validator: (_: unknown, v: number | undefined) =>
        v != null && v > cash
          ? Promise.reject(new Error("More than cash on hand"))
          : Promise.resolve(),
    },
  ];

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Income
      </Typography.Title>
      <p className="page-sub">Rent collected, cash on hand and bank transfers. Add expenses on the Expenses page.</p>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="Total collected" value={collected} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="Expenses" value={spent} styles={{ content: { color: "#e11d48" } }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="soft-card" loading={loading}>
            <Statistic
              title="Cash on hand"
              value={cash}
              styles={{ content: { color: "#16a34a" } }}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="In bank" value={inBank} styles={{ content: { color: "#4f46e5" } }} />
          </Card>
        </Col>
      </Row>

      <Card
        className="soft-card"
        extra={
          <Space wrap>
            <Button
              type="primary"
              icon={<BankOutlined />}
              disabled={cash <= 0}
              onClick={() => setOpen(true)}
            >
              Transfer to bank
            </Button>
          </Space>
        }
        title="History"
      >
        <Tabs
          items={[
            {
              key: "monthly",
              label: "Monthly summary",
              children: (
                <Table
                  rowKey="key"
                  loading={loading}
                  dataSource={monthly}
                  pagination={{ pageSize: 12, hideOnSinglePage: true }}
                  scroll={{ x: true }}
                  columns={[
                    { title: "Month", dataIndex: "month" },
                    { title: "Opening cash", dataIndex: "opening", render: fmt },
                    { title: "Rent collected", dataIndex: "collected", render: fmt },
                    { title: "To bank", dataIndex: "bank", render: fmt },
                    { title: "Expenses", dataIndex: "spent", render: fmt },
                    {
                      title: "Cash on hand (month end)",
                      dataIndex: "closing",
                      render: (v: number) => <b>{fmt(v)}</b>,
                    },
                  ]}
                />
              ),
            },
            {
              key: "collections",
              label: `Collections (${collections.length})`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={collections}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: "Collected on",
                      dataIndex: "paid_at",
                      render: (v: string) => dayjs(v).format("DD MMM YYYY"),
                    },
                    {
                      title: "Room / Shop",
                      dataIndex: "rooms",
                      render: (r: Collection["rooms"]) =>
                        r ? (
                          <Tag color={r.kind === "shop" ? "purple" : "blue"}>
                            {r.kind === "shop" ? "Shop" : "Room"} {r.room_number}
                          </Tag>
                        ) : (
                          "-"
                        ),
                    },
                    {
                      title: "For month",
                      dataIndex: "month",
                      render: (v: string) => dayjs(v).format("MMM YYYY"),
                    },
                    { title: "Cash received", dataIndex: "amount", render: fmt },
                    {
                      title: "From advance",
                      dataIndex: "advance_applied",
                      render: (v: number) => (Number(v) > 0 ? fmt(v) : "-"),
                    },
                  ]}
                />
              ),
            },
            {
              key: "returns",
              label: `Advance used / returned (${returns.length})`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={returns}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: "Date",
                      dataIndex: "return_date",
                      render: (v: string) => dayjs(v).format("DD MMM YYYY"),
                    },
                    { title: "Room / Shop", dataIndex: "room_label" },
                    {
                      title: "Type",
                      dataIndex: "kind",
                      render: (k: AdvanceReturn["kind"]) =>
                        k === "applied" ? <Tag color="gold">Deducted from rent</Tag> : <Tag color="green">Cash refund</Tag>,
                    },
                    { title: "Amount", dataIndex: "amount", render: fmt },
                    { title: "Note", dataIndex: "note", render: (v: string | null) => v ?? "-" },
                  ]}
                />
              ),
            },
            {
              key: "transfers",
              label: `Bank transfers (${transfers.length})`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={transfers}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: "Date",
                      dataIndex: "transfer_date",
                      render: (v: string) => dayjs(v).format("DD MMM YYYY"),
                    },
                    { title: "Amount", dataIndex: "amount", render: fmt },
                    { title: "Note", dataIndex: "note", render: (v: string | null) => v ?? "-" },
                    {
                      title: "",
                      render: (_, t: Transfer) => (
                        <Popconfirm
                          title="Delete this transfer? The amount goes back to cash."
                          onConfirm={() => removeTransfer(t.id)}
                        >
                          <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Transfer to bank"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Transfer"
        confirmLoading={saving}
        centered
      >
        <p>
          Cash on hand: <b>{fmt(cash)}</b>
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={transfer}
          initialValues={{ transfer_date: dayjs() }}
          autoComplete="off"
        >
          <Form.Item name="amount" label="Amount" rules={amountRules}>
            <InputNumber min={1} style={{ width: "100%" }} autoFocus />
          </Form.Item>
          <Form.Item name="transfer_date" label="Date" rules={[{ required: true }]}>
            <DatePicker allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input placeholder="e.g. Bank name, reference" />
          </Form.Item>
        </Form>
      </Modal>

    </>
  );
}
