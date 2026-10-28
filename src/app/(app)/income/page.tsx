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
  Tabs,
  Tag,
} from "antd";
import { BankOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
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

function EmptyList({ text }: { text: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}

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

  const tabs = [
    {
      key: "monthly",
      label: "Months",
      children:
        monthly.length === 0 ? (
          <EmptyList text="No income yet. Mark rent as paid on the Rent page." />
        ) : (
          <div className="row-list">
            {monthly.map((m) => (
              <div key={m.key} className="month-card">
                <div className="month-head">
                  <b>{m.month}</b>
                  <span>
                    <span style={{ color: "#64748b", fontSize: 12 }}>Cash at month end </span>
                    <b style={{ fontSize: 17 }}>{fmt(m.closing)}</b>
                  </span>
                </div>
                <div className="month-grid">
                  <div>
                    <span>Opening</span>
                    {fmt(m.opening)}
                  </div>
                  <div>
                    <span>Collected</span>
                    <b style={{ color: "#16a34a" }}>+{fmt(m.collected)}</b>
                  </div>
                  <div>
                    <span>To bank</span>
                    <b>-{fmt(m.bank)}</b>
                  </div>
                  <div>
                    <span>Expenses</span>
                    <b style={{ color: "#e11d48" }}>-{fmt(m.spent)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
        returns.length === 0 ? (
          <EmptyList text="No advance used or returned yet" />
        ) : (
          <div className="row-list">
            {returns.map((r) => (
              <div key={r.id} className="row-card">
                <div>
                  <div className="row-title">
                    {r.room_label}
                    {r.kind === "applied" ? (
                      <Tag color="gold" style={{ margin: 0 }}>
                        Deducted from rent
                      </Tag>
                    ) : (
                      <Tag color="green" style={{ margin: 0 }}>
                        Cash refund
                      </Tag>
                    )}
                  </div>
                  <div className="row-sub">
                    {dayjs(r.return_date).format("DD MMM YYYY")}
                    {r.note && ` - ${r.note}`}
                  </div>
                </div>
                <div className="row-amount">{fmt(r.amount)}</div>
              </div>
            ))}
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
        <div className="hero-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="hero-mini">
            <span>Total collected</span>
            <b>{fmt(collected)}</b>
          </div>
          <div className="hero-mini">
            <span>Expenses</span>
            <b>{fmt(spent)}</b>
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
