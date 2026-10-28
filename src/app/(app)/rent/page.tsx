"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, DatePicker, Empty, Input, Popconfirm, Progress, Segmented, Skeleton, Tag } from "antd";
import { CheckCircleFilled, LeftOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Unit = {
  id: string;
  kind: Kind;
  room_number: string;
  rent: number;
  payment_id: string | null;
  paid_at: string | null;
  paid_by: string | null;
};

const fmt = (v: number) => Number(v).toLocaleString();

export default function RentPage() {
  const { message } = App.useApp();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [rows, setRows] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [status, setStatus] = useState<"all" | "due" | "paid">("all");
  const [search, setSearch] = useState("");

  const monthKey = month.format("YYYY-MM-01");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [rooms, payments] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, kind, room_number, rent")
        .order("kind", { ascending: false })
        .order("room_number"),
      supabase.from("payments").select("id, room_id, paid_at, paid_by").eq("month", monthKey),
    ]);
    const err = rooms.error ?? payments.error;
    if (err) message.error(err.message);
    const paid = new Map((payments.data ?? []).map((p) => [p.room_id, p]));
    setRows(
      (rooms.data ?? []).map((r) => ({
        ...r,
        payment_id: paid.get(r.id)?.id ?? null,
        paid_at: paid.get(r.id)?.paid_at ?? null,
        paid_by: paid.get(r.id)?.paid_by ?? null,
      })),
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

  async function markPaid(row: Unit) {
    setBusy(row.id);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("payments").insert({
      paid_by: auth.user?.email ?? "admin",
      room_id: row.id,
      month: monthKey,
      amount: row.rent,
      paid_at: new Date().toISOString(),
    });
    setBusy(null);
    if (error) return message.error(error.message);
    message.success(`${row.room_number} marked as paid`);
    load();
  }

  async function markDue(row: Unit) {
    setBusy(row.id);
    const supabase = createClient();
    // Rent settled from advance: give that amount back to the room's advance.
    const { data: payment } = await supabase
      .from("payments")
      .select("advance_applied")
      .eq("id", row.payment_id!)
      .single();
    const { error } = await supabase.from("payments").delete().eq("id", row.payment_id!);
    if (error) {
      setBusy(null);
      return message.error(error.message);
    }
    const applied = Number(payment?.advance_applied ?? 0);
    if (applied > 0) {
      const { data: room } = await supabase.from("rooms").select("advance").eq("id", row.id).single();
      await supabase
        .from("rooms")
        .update({ advance: Number(room?.advance ?? 0) + applied })
        .eq("id", row.id);
    }
    setBusy(null);
    message.success(`${row.room_number} marked as due`);
    load();
  }

  const inKind = rows.filter((r) => kind === "all" || r.kind === kind);
  const total = inKind.reduce((s, r) => s + Number(r.rent), 0);
  const paidRows = inKind.filter((r) => r.paid_at);
  const paidTotal = paidRows.reduce((s, r) => s + Number(r.rent), 0);
  const percent = total ? Math.round((paidTotal / total) * 100) : 0;

  const q = search.trim().toLowerCase();
  const visible = inKind
    .filter((r) => status === "all" || (status === "paid" ? !!r.paid_at : !r.paid_at))
    .filter((r) => !q || r.room_number.toLowerCase().includes(q));

  return (
    <>
      <PageHeader
        title="Rent"
        subtitle="Tap Paid when rent is received. The date is saved automatically."
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
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <span style={{ color: "#16a34a" }}>{paidRows.length} paid</span>
          <span style={{ color: "#e11d48" }}>
            {inKind.length - paidRows.length} due - {fmt(total - paidTotal)}
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
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { label: "Rooms & Shops", value: "all" },
            { label: "Rooms", value: "room" },
            { label: "Shops", value: "shop" },
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
      ) : (
        <div className="unit-list">
          {visible.map((r) => (
            <div key={r.id} className={`unit-card ${r.paid_at ? "paid" : "due"}`}>
              <div>
                <div className="unit-title">
                  <Tag color={r.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                    {r.kind === "shop" ? "Shop" : "Room"}
                  </Tag>
                  <span className="unit-num">{r.room_number}</span>
                </div>
                <div className="unit-rent">{fmt(r.rent)}</div>
                {r.paid_at && (
                  <div className="unit-meta">Paid {dayjs(r.paid_at).format("DD MMM YYYY")} by Admin</div>
                )}
              </div>
              <div className="unit-action">
                {r.paid_at ? (
                  <>
                    <CheckCircleFilled style={{ color: "#16a34a", fontSize: 22 }} />
                    <Popconfirm title="Mark as due again?" onConfirm={() => markDue(r)}>
                      <Button type="text" loading={busy === r.id}>
                        Undo
                      </Button>
                    </Popconfirm>
                  </>
                ) : (
                  <Button type="primary" size="large" loading={busy === r.id} onClick={() => markPaid(r)}>
                    Paid
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
