"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Skeleton,
  Table,
  Tag,
} from "antd";
import { BankOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { useIsMobile } from "@/lib/useIsMobile";
import CompactList from "@/components/CompactList";
import PageHeader from "@/components/PageHeader";

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
type AdvanceMove = {
  id: string;
  amount: number;
  destination: "cash" | "bank";
  move_date: string;
  room_label: string | null;
  note: string | null;
};
type AdvanceReturn = {
  id: string;
  kind: "refund" | "applied";
  paid_from: "advance" | "cash";
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
  advance: number;
  closing: number;
};
type TransferValues = { amount: number; transfer_date: Dayjs; note?: string };

const fmt = (v: number | string) => Number(v).toLocaleString();

function EmptyList({ text }: { text: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}

export default function IncomePage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("monthly");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [returns, setReturns] = useState<AdvanceReturn[]>([]);
  const [moves, setMoves] = useState<AdvanceMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<TransferValues>();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [c, t, x, r, mv] = await Promise.all([
      fetchAll((lo, hi) =>
        supabase
          .from("payments")
          .select("id, amount, advance_applied, paid_at, month, rooms(kind, room_number)")
          .order("paid_at", { ascending: false })
          .order("id")
          .range(lo, hi)
          .overrideTypes<Collection[]>(),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("bank_transfers")
          .select("id, amount, transfer_date, note")
          .order("transfer_date", { ascending: false })
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("expenses")
          .select("id, amount, expense_date, note")
          .order("expense_date", { ascending: false })
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("advance_returns")
          .select("id, kind, paid_from, room_label, amount, return_date, note")
          .order("return_date", { ascending: false })
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("advance_moves")
          .select("id, amount, destination, move_date, room_label, note")
          .order("move_date", { ascending: false })
          .order("id")
          .range(lo, hi),
      ),
    ]);
    const err = c.error ?? t.error ?? x.error ?? r.error ?? mv.error;
    if (err) message.error(err.message);
    setCollections(c.data ?? []);
    setTransfers(t.data ?? []);
    setExpenses(x.data ?? []);
    setReturns(r.data ?? []);
    setMoves(mv.data ?? []);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Rent income = cash received + the part settled from the tenant's advance.
  const rentOf = (c: Collection) => Number(c.amount) + Number(c.advance_applied);
  const collected = collections.reduce((s, c) => s + rentOf(c), 0);
  const toBank = transfers.reduce((s, t) => s + Number(t.amount), 0);
  const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  // Advance is security money held separately. It only joins cash on hand or the bank once the
  // owner moves it, and a refund paid out of cash takes it back out.
  const movedCash = moves.filter((m) => m.destination === "cash").reduce((s, m) => s + Number(m.amount), 0);
  const movedBank = moves.filter((m) => m.destination === "bank").reduce((s, m) => s + Number(m.amount), 0);
  const cashRefunds = returns
    .filter((r) => r.kind === "refund" && r.paid_from === "cash")
    .reduce((s, r) => s + Number(r.amount), 0);
  const inBank = toBank + movedBank;
  const cash = collected - toBank - spent + movedCash - cashRefunds;

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
    // Advance moved into cash adds to cash; refunds paid out of cash take it away.
    const adv = new Map<string, number>();
    const addAdv = (d: string, amount: number) => {
      const k = dayjs(d).format("YYYY-MM");
      adv.set(k, (adv.get(k) ?? 0) + amount);
    };
    moves.filter((m) => m.destination === "cash").forEach((m) => addAdv(m.move_date, Number(m.amount)));
    returns
      .filter((r) => r.kind === "refund" && r.paid_from === "cash")
      .forEach((r) => addAdv(r.return_date, -Number(r.amount)));
    const keys = [...col.keys(), ...tr.keys(), ...ex.keys(), ...adv.keys()].sort();
    if (!keys.length) return [];
    const rows: MonthRow[] = [];
    let opening = 0;
    for (let m = dayjs(keys[0] + "-01"); !m.isAfter(dayjs(), "month"); m = m.add(1, "month")) {
      const k = m.format("YYYY-MM");
      const collectedM = col.get(k) ?? 0;
      const bankM = tr.get(k) ?? 0;
      const spentM = ex.get(k) ?? 0;
      const advM = adv.get(k) ?? 0;
      const closing = opening + collectedM - bankM - spentM + advM;
      rows.push({
        key: k,
        month: m.format("MMMM YYYY"),
        opening,
        collected: collectedM,
        bank: bankM,
        spent: spentM,
        advance: advM,
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

  const hasAdvance = monthly.some((m) => m.advance !== 0);

  // Advance moved to cash/bank, refunded or deducted from rent, newest first.
  const advanceRows = [
    ...moves.map((m) => ({
      key: `m-${m.id}`,
      date: m.move_date,
      room: m.room_label ?? "-",
      tag: { color: "geekblue", label: m.destination === "bank" ? "Moved to bank" : "Moved to cash" },
      note: m.note,
      amount: Number(m.amount),
      incoming: true,
    })),
    ...returns.map((r) => ({
      key: `r-${r.id}`,
      date: r.return_date,
      room: r.room_label,
      tag:
        r.kind === "applied"
          ? { color: "gold", label: "Deducted from rent" }
          : { color: "green", label: r.paid_from === "cash" ? "Refund from cash" : "Refund" },
      note: r.note,
      amount: Number(r.amount),
      incoming: false,
    })),
  ].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const pager = false as const; // show every row, never split into pages

  const tabs = [
    {
      key: "monthly",
      label: "Month by month",
      children:
        monthly.length === 0 ? (
          <EmptyList text="No income yet. Mark rent as paid on the Rent page." />
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {monthly.map((m) => (
              <div key={m.key} className="month-card">
                <div className="month-head">
                  <b style={{ fontSize: 16 }}>{m.month}</b>
                </div>
                {[
                  { label: "Opening cash", value: fmt(m.opening) },
                  { label: "Rent collected", value: `+${fmt(m.collected)}`, color: "#16a34a" },
                  { label: "Sent to bank", value: `-${fmt(m.bank)}` },
                  { label: "Expenses", value: `-${fmt(m.spent)}`, color: "#e11d48" },
                  {
                    label: "Net income",
                    value: fmt(m.collected - m.spent),
                    color: m.collected - m.spent >= 0 ? "#16a34a" : "#e11d48",
                  },
                  ...(hasAdvance
                    ? [{ label: "Advance", value: `${m.advance >= 0 ? "+" : "-"}${fmt(Math.abs(m.advance))}` }]
                    : []),
                ].map((x) => (
                  <div
                    key={x.label}
                    style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}
                  >
                    <span style={{ color: "#334155", fontWeight: 600 }}>{x.label}</span>
                    <b style={{ color: x.color }}>{x.value}</b>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderTop: "1px solid #eceef6",
                    marginTop: 6,
                    paddingTop: 8,
                  }}
                >
                  <b>Cash on hand (month end)</b>
                  <b style={{ fontSize: 17 }}>{fmt(m.closing)}</b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table<MonthRow>
            rowKey="key"
            dataSource={monthly}
            size="middle"
            pagination={false}
            columns={[
              { title: "Month", dataIndex: "month", render: (v: string) => <b>{v}</b> },
              { title: "Opening cash", dataIndex: "opening", align: "right", render: (v: number) => fmt(v) },
              {
                title: "Rent collected",
                dataIndex: "collected",
                align: "right",
                render: (v: number) => <span style={{ color: "#16a34a", fontWeight: 700 }}>+{fmt(v)}</span>,
              },
              { title: "Sent to bank", dataIndex: "bank", align: "right", render: (v: number) => `-${fmt(v)}` },
              {
                title: "Expenses",
                dataIndex: "spent",
                align: "right",
                render: (v: number) => <span style={{ color: "#e11d48", fontWeight: 700 }}>-{fmt(v)}</span>,
              },
              {
                title: "Net income",
                align: "right",
                render: (_, m) => (
                  <b style={{ color: m.collected - m.spent >= 0 ? "#16a34a" : "#e11d48" }}>
                    {fmt(m.collected - m.spent)}
                  </b>
                ),
              },
              ...(hasAdvance
                ? [
                    {
                      title: "Advance",
                      dataIndex: "advance",
                      align: "right" as const,
                      render: (v: number) => `${v >= 0 ? "+" : "-"}${fmt(Math.abs(v))}`,
                    },
                  ]
                : []),
              {
                title: "Cash on hand (month end)",
                dataIndex: "closing",
                align: "right",
                render: (v: number) => <b>{fmt(v)}</b>,
              },
            ]}
          />
        ),
    },
    {
      key: "collections",
      label: "Rent collected",
      children:
        collections.length === 0 ? (
          <EmptyList text="No rent collected yet" />
        ) : isMobile ? (
          <CompactList
            items={collections.map((c) => ({
              key: c.id,
              title: (
                <>
                  {c.rooms && (
                    <Tag color={c.rooms.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                      {c.rooms.kind === "shop" ? "Shop" : "Room"}
                    </Tag>
                  )}
                  {c.rooms?.room_number ?? "-"}
                </>
              ),
              sub: `${dayjs(c.month).format("MMM YYYY")} rent - ${dayjs(c.paid_at).format("DD MMM YYYY")}`,
              amount: <span style={{ color: "#16a34a" }}>+{fmt(rentOf(c))}</span>,
            }))}
          />
        ) : (
          <Table<Collection>
            rowKey="id"
            dataSource={collections}
            size="middle"
            pagination={pager}
            columns={[
              {
                title: "Collected on",
                dataIndex: "paid_at",
                width: 140,
                sorter: (x, y) => x.paid_at.localeCompare(y.paid_at),
                render: (v: string) => dayjs(v).format("DD MMM YYYY"),
              },
              {
                title: "Type",
                width: 100,
                render: (_, c) =>
                  c.rooms ? (
                    <Tag color={c.rooms.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                      {c.rooms.kind === "shop" ? "Shop" : "Room"}
                    </Tag>
                  ) : (
                    "-"
                  ),
              },
              {
                title: "Name",
                width: 240,
                render: (_, c) => (c.rooms ? <b style={{ whiteSpace: "nowrap" }}>{c.rooms.room_number}</b> : "-"),
              },
              {
                title: "Rent for",
                dataIndex: "month",
                render: (v: string) => dayjs(v).format("MMM YYYY"),
              },
              {
                title: "From advance",
                align: "right",
                render: (_, c) => (Number(c.advance_applied) > 0 ? fmt(c.advance_applied) : "-"),
              },
              {
                title: "Amount",
                align: "right",
                sorter: (x, y) => rentOf(x) - rentOf(y),
                render: (_, c) => <b style={{ color: "#16a34a" }}>+{fmt(rentOf(c))}</b>,
              },
            ]}
          />
        ),
    },
    {
      key: "transfers",
      label: "Bank transfers",
      children:
        transfers.length === 0 ? (
          <EmptyList text="No bank transfers yet" />
        ) : isMobile ? (
          <CompactList
            items={transfers.map((t) => ({
              key: t.id,
              title: dayjs(t.transfer_date).format("DD MMM YYYY"),
              sub: t.note ?? "Transfer to bank",
              amount: fmt(t.amount),
              actions: (
                <Popconfirm
                  title="Delete this transfer? The amount goes back to cash."
                  onConfirm={() => removeTransfer(t.id)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            }))}
          />
        ) : (
          <Table<Transfer>
            rowKey="id"
            dataSource={transfers}
            size="middle"
            pagination={pager}
            columns={[
              {
                title: "Date",
                dataIndex: "transfer_date",
                width: 140,
                sorter: (x, y) => x.transfer_date.localeCompare(y.transfer_date),
                render: (v: string) => dayjs(v).format("DD MMM YYYY"),
              },
              { title: "Note", dataIndex: "note", render: (v: string | null) => v ?? "-" },
              {
                title: "Amount",
                dataIndex: "amount",
                align: "right",
                sorter: (x, y) => Number(x.amount) - Number(y.amount),
                render: (v: number) => <b>{fmt(v)}</b>,
              },
              {
                title: "",
                align: "right",
                width: 80,
                render: (_, t) => (
                  <Popconfirm
                    title="Delete this transfer? The amount goes back to cash."
                    onConfirm={() => removeTransfer(t.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
              },
            ]}
          />
        ),
    },
    {
      key: "returns",
      label: "Advance",
      children:
        advanceRows.length === 0 ? (
          <EmptyList text="No advance moved, used or returned yet" />
        ) : isMobile ? (
          <CompactList
            items={advanceRows.map((r) => ({
              key: r.key,
              title: (
                <>
                  {r.room}
                  <Tag color={r.tag.color} style={{ margin: 0 }}>
                    {r.tag.label}
                  </Tag>
                </>
              ),
              sub: `${dayjs(r.date).format("DD MMM YYYY")}${r.note ? ` - ${r.note}` : ""}`,
              amount: fmt(r.amount),
            }))}
          />
        ) : (
          <Table
            rowKey="key"
            dataSource={advanceRows}
            size="middle"
            pagination={pager}
            columns={[
              {
                title: "Date",
                dataIndex: "date",
                width: 140,
                sorter: (x, y) => x.date.localeCompare(y.date),
                render: (v: string) => dayjs(v).format("DD MMM YYYY"),
              },
              { title: "Room / Shop", dataIndex: "room" },
              {
                title: "What happened",
                render: (_, r) => (
                  <Tag color={r.tag.color} style={{ margin: 0 }}>
                    {r.tag.label}
                  </Tag>
                ),
              },
              { title: "Note", dataIndex: "note", render: (v: string | null) => v ?? "-" },
              {
                title: "Amount",
                dataIndex: "amount",
                align: "right",
                render: (v: number) => <b>{fmt(v)}</b>,
              },
            ]}
          />
        ),
    },
  ];

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
      <PageHeader
        title="Income"
        subtitle="Rent collected, cash on hand and bank transfers."
        extra={
          <Button
            type="primary"
            size="large"
            icon={<BankOutlined />}
            disabled={cash <= 0}
            onClick={() => setOpen(true)}
          >
            Transfer to bank
          </Button>
        }
      />

      <div className="hero">
        <div className="hero-label">Cash on hand</div>
        <div className="hero-amount">{loading ? "..." : fmt(cash)}</div>
        <div className="hero-grid">
          <div className="hero-mini">
            <span>Total collected</span>
            <b>{fmt(collected)}</b>
          </div>
          <div className="hero-mini">
            <span>Expenses</span>
            <b>- {fmt(spent)}</b>
          </div>
          <div className="hero-mini">
            <span>Net income</span>
            <b>{fmt(collected - spent)}</b>
          </div>
          <div className="hero-mini">
            <span>In bank</span>
            <b>{fmt(inBank)}</b>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <Skeleton active />
        ) : (
          <>
            <div className="tab-grid">
              {tabs.map((t) => (
                <Button
                  key={t.key}
                  size="large"
                  type={tab === t.key ? "primary" : "default"}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            {tabs.find((t) => t.key === tab)?.children}
          </>
        )}
      </div>

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
          preserve={false}
          layout="vertical"
          onFinish={transfer}
          initialValues={{ transfer_date: dayjs() }}
          autoComplete="off"
        >
          <Form.Item name="amount" label="Amount" rules={amountRules}>
            <InputNumber size="large" min={1} style={{ width: "100%" }} autoFocus />
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
