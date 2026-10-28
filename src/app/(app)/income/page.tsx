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
  Tabs,
  Tag,
} from "antd";
import { BankOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/lib/useIsMobile";
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
        .select("id, kind, paid_from, room_label, amount, return_date, note")
        .order("return_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("advance_moves")
        .select("id, amount, destination, move_date, room_label, note")
        .order("move_date", { ascending: false })
        .order("created_at", { ascending: false }),
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

  const tabs = [
    {
      key: "monthly",
      label: "Months",
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
                    style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}
                  >
                    <span style={{ color: "#64748b" }}>{x.label}</span>
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
            pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }}
            columns={[
              { title: "Month", dataIndex: "month", render: (v: string) => <b>{v}</b> },
              { title: "Opening cash", dataIndex: "opening", align: "right", render: (v: number) => fmt(v) },
              {
                title: "Rent collected",
                dataIndex: "collected",
                align: "right",
                render: (v: number) => <span style={{ color: "#16a34a" }}>+{fmt(v)}</span>,
              },
              { title: "Sent to bank", dataIndex: "bank", align: "right", render: (v: number) => `-${fmt(v)}` },
              {
                title: "Expenses",
                dataIndex: "spent",
                align: "right",
                render: (v: number) => <span style={{ color: "#e11d48" }}>-{fmt(v)}</span>,
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
      label: "Collected",
      children:
        collections.length === 0 ? (
          <EmptyList text="No rent collected yet" />
        ) : (
          <div className="row-list">
            {collections.map((c) => (
              <div key={c.id} className="row-card">
                <div>
                  <div className="row-title">
                    {c.rooms && (
                      <Tag color={c.rooms.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                        {c.rooms.kind === "shop" ? "Shop" : "Room"}
                      </Tag>
                    )}
                    {c.rooms?.room_number ?? "-"}
                  </div>
                  <div className="row-sub">
                    {dayjs(c.month).format("MMM YYYY")} rent - collected{" "}
                    {dayjs(c.paid_at).format("DD MMM YYYY")}
                    {Number(c.advance_applied) > 0 && ` - ${fmt(c.advance_applied)} from advance`}
                  </div>
                </div>
                <div className="row-amount in">+{fmt(rentOf(c))}</div>
              </div>
            ))}
          </div>
        ),
    },
    {
      key: "transfers",
      label: "Bank",
      children:
        transfers.length === 0 ? (
          <EmptyList text="No bank transfers yet" />
        ) : (
          <div className="row-list">
            {transfers.map((t) => (
              <div key={t.id} className="row-card">
                <div>
                  <div className="row-title">{dayjs(t.transfer_date).format("DD MMM YYYY")}</div>
                  <div className="row-sub">{t.note ?? "Transfer to bank"}</div>
                </div>
                <div className="row-side">
                  <div className="row-amount">{fmt(t.amount)}</div>
                  <Popconfirm
                    title="Delete this transfer? The amount goes back to cash."
                    onConfirm={() => removeTransfer(t.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        ),
    },
    {
      key: "returns",
      label: "Advance",
      children:
        returns.length + moves.length === 0 ? (
          <EmptyList text="No advance moved, used or returned yet" />
        ) : (
          <div className="row-list">
            {[
              ...moves.map((m) => ({ type: "move" as const, date: m.move_date, id: m.id, m })),
              ...returns.map((r) => ({ type: "return" as const, date: r.return_date, id: r.id, r })),
            ]
              .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
              .map((e) =>
                e.type === "move" ? (
                  <div key={`m-${e.id}`} className="row-card">
                    <div>
                      <div className="row-title">
                        Advance moved{e.m.room_label ? ` - ${e.m.room_label}` : ""}
                        <Tag color="geekblue" style={{ margin: 0 }}>
                          To {e.m.destination === "bank" ? "bank" : "cash on hand"}
                        </Tag>
                      </div>
                      <div className="row-sub">
                        {dayjs(e.m.move_date).format("DD MMM YYYY")}
                        {e.m.note && ` - ${e.m.note}`}
                      </div>
                    </div>
                    <div className="row-amount in">+{fmt(e.m.amount)}</div>
                  </div>
                ) : (
                  <div key={`r-${e.id}`} className="row-card">
                    <div>
                      <div className="row-title">
                        {e.r.room_label}
                        {e.r.kind === "applied" ? (
                          <Tag color="gold" style={{ margin: 0 }}>
                            Deducted from rent
                          </Tag>
                        ) : (
                          <Tag color="green" style={{ margin: 0 }}>
                            {e.r.paid_from === "cash" ? "Refund from cash" : "Refund"}
                          </Tag>
                        )}
                      </div>
                      <div className="row-sub">
                        {dayjs(e.r.return_date).format("DD MMM YYYY")}
                        {e.r.note && ` - ${e.r.note}`}
                      </div>
                    </div>
                    <div className="row-amount">{fmt(e.r.amount)}</div>
                  </div>
                ),
              )}
          </div>
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
        {loading ? <Skeleton active /> : <Tabs items={tabs} />}
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
