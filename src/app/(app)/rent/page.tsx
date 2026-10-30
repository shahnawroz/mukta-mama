"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Table,
  Tag,
} from "antd";
import { LeftOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { useIsMobile } from "@/lib/useIsMobile";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Payment = {
  id: string;
  room_id: string;
  amount: number;
  advance_applied: number;
  paid_at: string;
};
type Unit = {
  id: string;
  kind: Kind;
  room_number: string;
  rent: number;
  payments: Payment[];
  paid: number;
  remaining: number;
};

const fmt = (v: number) => Number(v).toLocaleString();
const labelOf = (u: { kind: Kind; room_number: string }) =>
  `${u.kind === "shop" ? "Shop" : "Room"} ${u.room_number}`;
const TypeTag = ({ kind }: { kind: Kind }) => (
  <Tag color={kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
    {kind === "shop" ? "Shop" : "Room"}
  </Tag>
);

function statusOf(u: Unit) {
  if (Number(u.rent) <= 0) return "norent" as const;
  if (u.remaining === 0) return "paid" as const;
  return u.paid > 0 ? ("part" as const) : ("due" as const);
}

function StatusTag({ unit }: { unit: Unit }) {
  const s = statusOf(unit);
  if (s === "paid") return <Tag color="green" style={{ margin: 0 }}>Paid</Tag>;
  if (s === "part") return <Tag color="orange" style={{ margin: 0 }}>Part paid</Tag>;
  if (s === "norent") return <Tag style={{ margin: 0 }}>No rent set</Tag>;
  return <Tag color="red" style={{ margin: 0 }}>Due</Tag>;
}

export default function RentPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [rows, setRows] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [status, setStatus] = useState<"all" | "due" | "paid">("all");
  const [search, setSearch] = useState("");

  const [partUnit, setPartUnit] = useState<Unit | null>(null);
  const [partForm] = Form.useForm<{ amount: number }>();

  const monthKey = month.format("YYYY-MM-01");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [rooms, payments] = await Promise.all([
      fetchAll((lo, hi) =>
        supabase
          .from("rooms")
          .select("id, kind, room_number, rent")
          .order("kind", { ascending: false })
          .order("room_number")
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("payments")
          .select("id, room_id, amount, advance_applied, paid_at")
          .eq("month", monthKey)
          .order("paid_at")
          .order("id")
          .range(lo, hi),
      ),
    ]);
    const err = rooms.error ?? payments.error;
    if (err) message.error(err.message);
    const byRoom = new Map<string, Payment[]>();
    (payments.data ?? []).forEach((p) => {
      byRoom.set(p.room_id, [...(byRoom.get(p.room_id) ?? []), p]);
    });
    setRows(
      (rooms.data ?? []).map((r) => {
        const list = byRoom.get(r.id) ?? [];
        const paid = list.reduce((s, p) => s + Number(p.amount) + Number(p.advance_applied), 0);
        return {
          ...r,
          payments: list,
          paid,
          remaining: Math.max(Number(r.rent) - paid, 0),
        };
      }),
    );
    setLoading(false);
  }, [monthKey, message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function changeMonth(next: Dayjs) {
    setLoading(true);
    setMonth(next);
  }

  async function receive(unit: Unit, amount: number) {
    setBusy(unit.id);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("payments").insert({
      paid_by: auth.user?.email ?? "admin",
      room_id: unit.id,
      month: monthKey,
      amount,
      paid_at: new Date().toISOString(),
    });
    setBusy(null);
    if (error) {
      message.error(error.message);
      return false;
    }
    message.success(
      amount >= unit.remaining
        ? `${labelOf(unit)} marked as paid`
        : `${fmt(amount)} received from ${labelOf(unit)}, ${fmt(unit.remaining - amount)} still due`,
    );
    load();
    return true;
  }

  async function payFull(unit: Unit) {
    await receive(unit, unit.remaining);
  }

  async function payPart(values: { amount: number }) {
    const ok = await receive(partUnit!, values.amount);
    if (!ok) return;
    setPartUnit(null);
  }

  async function removePayment(unit: Unit, p: Payment) {
    setBusy(unit.id);
    const supabase = createClient();
    const { error } = await supabase.from("payments").delete().eq("id", p.id);
    if (error) {
      setBusy(null);
      return message.error(error.message);
    }
    // Rent settled from advance: give that amount back to the room's advance.
    const applied = Number(p.advance_applied);
    if (applied > 0) {
      const { data: room } = await supabase.from("rooms").select("advance").eq("id", unit.id).single();
      await supabase
        .from("rooms")
        .update({ advance: Number(room?.advance ?? 0) + applied })
        .eq("id", unit.id);
    }
    setBusy(null);
    message.success("Payment removed");
    load();
  }

  const inKind = rows.filter((r) => kind === "all" || r.kind === kind);
  const total = inKind.reduce((s, r) => s + Number(r.rent), 0);
  const paidTotal = inKind.reduce((s, r) => s + Math.min(r.paid, Number(r.rent)), 0);
  const fullyPaid = inKind.filter((r) => statusOf(r) === "paid").length;
  const partial = inKind.filter((r) => statusOf(r) === "part").length;
  const owing = inKind.filter((r) => r.remaining > 0).length;
  const percent = total ? Math.round((paidTotal / total) * 100) : 0;

  const q = search.trim().toLowerCase();
  const visible = inKind
    .filter((r) => {
      if (status === "all") return true;
      return status === "due" ? r.remaining > 0 : statusOf(r) === "paid";
    })
    .filter((r) => !q || r.room_number.toLowerCase().includes(q));

  // Every action is a visible button: Part, Paid (or Pay the rest) and Undo.
  const action = (r: Unit) => {
    const st = statusOf(r);
    const last = r.payments[r.payments.length - 1];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {st === "paid" && last && (
          <span style={{ color: "#64748b", fontSize: 15 }}>{dayjs(last.paid_at).format("DD MMM")}</span>
        )}
        {(st === "due" || st === "part") && (
          <Button onClick={() => setPartUnit(r)}>Part</Button>
        )}
        {(st === "due" || st === "part") && (
          <Button type="primary" loading={busy === r.id} onClick={() => payFull(r)}>
            {st === "part" ? `Pay ${fmt(r.remaining)}` : "Paid"}
          </Button>
        )}
        {last && (
          <Popconfirm
            title={
              Number(last.advance_applied) > 0
                ? "Undo the last payment? Advance used in it goes back to the advance."
                : `Undo the last payment of ${fmt(last.amount)}?`
            }
            onConfirm={() => removePayment(r, last)}
          >
            <Button danger type="text" loading={busy === r.id}>
              Undo
            </Button>
          </Popconfirm>
        )}
      </span>
    );
  };

  return (
    <>
      <PageHeader
        title="Rent"
        subtitle="Tap Paid when the rent is received."
        extra={
          <div className="month-nav">
            <Button
              icon={<LeftOutlined />}
              onClick={() => changeMonth(month.subtract(1, "month"))}
              aria-label="Previous month"
            />
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(d) => d && changeMonth(d)}
              format="MMMM YYYY"
              style={{ width: 150 }}
            />
            <Button
              icon={<RightOutlined />}
              onClick={() => changeMonth(month.add(1, "month"))}
              aria-label="Next month"
            />
          </div>
        }
      />

      <Card className="soft-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{fmt(paidTotal)}</span>
            <span style={{ color: "#64748b" }}> of {fmt(total)} collected</span>
          </div>
          <b style={{ color: "#4f46e5" }}>{percent}%</b>
        </div>
        <Progress percent={percent} strokeColor="#4f46e5" showInfo={false} />
        <div style={{ display: "flex", gap: 16, fontSize: 15, flexWrap: "wrap" }}>
          <span style={{ color: "#16a34a", fontWeight: 700 }}>{fullyPaid} paid</span>
          {partial > 0 && <span style={{ color: "#d97706", fontWeight: 700 }}>{partial} part paid</span>}
          <span style={{ color: "#e11d48", fontWeight: 700 }}>
            {owing} owing - {fmt(total - paidTotal)} due
          </span>
        </div>
      </Card>

      <div className="toolbar">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { label: "All", value: "all" },
            { label: "Due", value: "due" },
            { label: "Paid", value: "paid" },
          ]}
        />
        <Select
          value={kind}
          onChange={setKind}
          style={{ width: 150 }}
          options={[
            { label: "Rooms & Shops", value: "all" },
            { label: "Rooms only", value: "room" },
            { label: "Shops only", value: "shop" },
          ]}
        />
        <Input
          className="grow"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Card className="soft-card">
          <Skeleton active />
        </Card>
      ) : visible.length === 0 ? (
        <Card className="soft-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              rows.length === 0
                ? "No rooms or shops yet. Add some in Rooms & Shops."
                : status === "due"
                  ? "Nothing due. Everything is collected."
                  : "Nothing matches."
            }
          />
        </Card>
      ) : isMobile ? (
        <div className="unit-list">
          {visible.map((r) => {
            const s = statusOf(r);
            return (
              <div
                key={r.id}
                className={`unit-card wrappable ${s === "paid" ? "paid" : s === "part" ? "part" : s === "norent" ? "plain" : "due"}`}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="unit-title">
                    <TypeTag kind={r.kind} />
                    <span className="unit-num">{r.room_number}</span>
                  </div>
                  <div className="unit-stats">
                    <span>
                      Rent <b>{fmt(r.rent)}</b>
                    </span>
                    {r.paid > 0 && r.remaining > 0 && (
                      <span style={{ color: "#e11d48", fontWeight: 700 }}>
                        Due <b>{fmt(r.remaining)}</b>
                      </span>
                    )}
                    {s === "paid" && <span style={{ color: "#16a34a", fontWeight: 700 }}>Paid</span>}
                    {s === "norent" && <span style={{ color: "#94a3b8" }}>No rent set</span>}
                  </div>
                </div>
                <div className="unit-action wrap">{action(r)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="soft-card" styles={{ body: { padding: 0 } }}>
          <Table<Unit>
            rowKey="id"
            dataSource={visible}
            size="middle"
            pagination={false}
            sticky
            columns={[
              {
                title: "Type",
                dataIndex: "kind",
                width: 100,
                sorter: (a, b) => a.kind.localeCompare(b.kind),
                render: (k: Kind) => <TypeTag kind={k} />,
              },
              {
                title: "Name",
                dataIndex: "room_number",
                width: 240,
                sorter: (a, b) =>
                  a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
                render: (v: string) => <b style={{ whiteSpace: "nowrap" }}>{v}</b>,
              },
              {
                title: "Rent",
                dataIndex: "rent",
                align: "right",
                render: (v: number) => fmt(v),
              },
              {
                title: "Paid",
                align: "right",
                render: (_, r) =>
                  r.paid > 0 ? (
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{fmt(r.paid)}</span>
                  ) : (
                    <span style={{ color: "#cbd5e1" }}>-</span>
                  ),
              },
              {
                title: "Due",
                align: "right",
                render: (_, r) =>
                  r.remaining > 0 && Number(r.rent) > 0 ? (
                    <b style={{ color: "#e11d48" }}>{fmt(r.remaining)}</b>
                  ) : (
                    <span style={{ color: "#cbd5e1" }}>-</span>
                  ),
              },
              {
                title: "Status",
                render: (_, r) => <StatusTag unit={r} />,
              },
              {
                title: "",
                align: "right",
                width: 250,
                render: (_, r) => action(r),
              },
            ]}
          />
        </Card>
      )}

      <Modal
        title={partUnit ? `Receive rent - ${labelOf(partUnit)}` : ""}
        open={!!partUnit}
        onCancel={() => setPartUnit(null)}
        onOk={() => partForm.submit()}
        okText="Receive"
        confirmLoading={busy === partUnit?.id}
        centered
        destroyOnHidden
      >
        <p>
          Rent {fmt(partUnit?.rent ?? 0)} - already paid {fmt(partUnit?.paid ?? 0)} - still due{" "}
          <b>{fmt(partUnit?.remaining ?? 0)}</b>
        </p>
        <Form
          key={partUnit?.id}
          form={partForm}
          preserve={false}
          layout="vertical"
          onFinish={payPart}
          autoComplete="off"
        >
          <Form.Item
            name="amount"
            label="Amount received now"
            extra="Anything not received now stays due. You can receive the rest later."
            rules={[
              { required: true, message: "Enter the amount received" },
              {
                validator: (_, v: number | undefined) =>
                  v != null && v > (partUnit?.remaining ?? 0)
                    ? Promise.reject(new Error("More than the rent still due"))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber size="large" min={1} style={{ width: "100%" }} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
