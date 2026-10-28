"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Empty, Progress, Skeleton, Tag } from "antd";
import { BankOutlined, MinusCircleOutlined, WalletOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Unit = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type Payment = { room_id: string; amount: number; advance_applied: number };

const fmt = (v: number) => Number(v).toLocaleString();

function sumOf(units: Unit[], paidByUnit: Map<string, number>) {
  const total = units.reduce((s, u) => s + Number(u.rent), 0);
  const paidUnits = units.filter((u) => paidByUnit.has(u.id));
  const paid = paidUnits.reduce((s, u) => s + (paidByUnit.get(u.id) ?? 0), 0);
  return { count: units.length, paidCount: paidUnits.length, total, paid };
}

function GroupRow({
  label,
  color,
  data,
}: {
  label: string;
  color: string;
  data: ReturnType<typeof sumOf>;
}) {
  const percent = data.total ? Math.round((data.paid / data.total) * 100) : 0;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b>
          {label} <span style={{ color: "#64748b", fontWeight: 400 }}>({data.count})</span>
        </b>
        <span style={{ color: "#64748b" }}>
          {data.paidCount}/{data.count} paid
        </span>
      </div>
      <Progress percent={percent} strokeColor={color} showInfo={false} size="small" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "#16a34a" }}>Paid {fmt(data.paid)}</span>
        <span style={{ color: "#e11d48" }}>Due {fmt(data.total - data.paid)}</span>
        <span style={{ color: "#64748b" }}>Total {fmt(data.total)}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [collectedAll, setCollectedAll] = useState(0);
  const [inBank, setInBank] = useState(0);
  const [electricity, setElectricity] = useState(0);
  const [spent, setSpent] = useState(0);
  const [spentMonth, setSpentMonth] = useState(0);
  const month = dayjs();

  useEffect(() => {
    const key = dayjs().format("YYYY-MM-01");
    const supabase = createClient();
    Promise.all([
      supabase.from("rooms").select("id, kind, room_number, rent, advance").order("room_number"),
      supabase.from("payments").select("room_id, amount, advance_applied").eq("month", key),
      supabase.from("payments").select("amount, advance_applied"),
      supabase.from("bank_transfers").select("amount"),
      supabase.from("expenses").select("amount, expense_date"),
      supabase
        .from("electricity_deposits")
        .select("amount")
        .gte("deposit_date", key)
        .lt("deposit_date", dayjs(key).add(1, "month").format("YYYY-MM-DD")),
    ]).then(([rooms, pays, allPays, transfers, expenses, power]) => {
      const err =
        rooms.error ?? pays.error ?? allPays.error ?? transfers.error ?? expenses.error ?? power.error;
      if (err) message.error(err.message);
      const sum = (rows: { amount: number }[] | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
      setUnits(rooms.data ?? []);
      setPayments(pays.data ?? []);
      setCollectedAll(
        (allPays.data ?? []).reduce((s, r) => s + Number(r.amount) + Number(r.advance_applied), 0),
      );
      setInBank(sum(transfers.data));
      setSpent(sum(expenses.data));
      setSpentMonth(sum((expenses.data ?? []).filter((e) => e.expense_date >= key)));
      setElectricity(sum(power.data));
    });
  }, [message]);

  const loading = units === null;
  const all = units ?? [];
  const paidByUnit = new Map(
    payments.map((p) => [p.room_id, Number(p.amount) + Number(p.advance_applied)]),
  );
  const overall = sumOf(all, paidByUnit);
  const rooms = sumOf(all.filter((u) => u.kind === "room"), paidByUnit);
  const shops = sumOf(all.filter((u) => u.kind === "shop"), paidByUnit);
  const unpaid = all.filter((u) => !paidByUnit.has(u.id));
  const advance = all.reduce((s, u) => s + Number(u.advance), 0);
  const percent = overall.total ? Math.round((overall.paid / overall.total) * 100) : 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${month.format("MMMM YYYY")} overview`} />

      <div className="hero">
        <div className="hero-label">Cash on hand</div>
        <div className="hero-amount">{loading ? "..." : fmt(collectedAll - inBank - spent)}</div>
        <div className="hero-grid">
          <div className="hero-mini">
            <span>In bank</span>
            <b>{fmt(inBank)}</b>
          </div>
          <div className="hero-mini">
            <span>Advance held</span>
            <b>{fmt(advance)}</b>
          </div>
          <div className="hero-mini">
            <span>Expenses this month</span>
            <b>{fmt(spentMonth)}</b>
          </div>
          <div className="hero-mini">
            <span>Electricity this month</span>
            <b>{fmt(electricity)}</b>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <Button type="primary" size="large" icon={<WalletOutlined />} onClick={() => router.push("/rent")}>
          Collect rent
        </Button>
        <Button size="large" icon={<MinusCircleOutlined />} onClick={() => router.push("/expenses")}>
          Add expense
        </Button>
        <Button size="large" icon={<BankOutlined />} onClick={() => router.push("/income")}>
          Transfer to bank
        </Button>
      </div>

      <div className="section-title">Rent this month</div>
      <Card className="soft-card">
        {loading ? (
          <Skeleton active />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <span style={{ fontSize: 28, fontWeight: 700 }}>{fmt(overall.paid)}</span>
                <span style={{ color: "#64748b" }}> of {fmt(overall.total)} collected</span>
              </div>
              <b style={{ color: "#4f46e5" }}>{percent}%</b>
            </div>
            <Progress percent={percent} strokeColor="#4f46e5" showInfo={false} />
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {overall.paidCount} of {overall.count} paid - {fmt(overall.total - overall.paid)} still due
            </div>
            <GroupRow label="Rooms" color="#2563eb" data={rooms} />
            <GroupRow label="Shops" color="#9333ea" data={shops} />
          </>
        )}
      </Card>

      <div className="section-title">Waiting for rent {!loading && `(${unpaid.length})`}</div>
      {loading ? (
        <Card className="soft-card">
          <Skeleton active />
        </Card>
      ) : unpaid.length === 0 ? (
        <Card className="soft-card">
          <Empty description="Everything collected this month" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <div className="unit-list">
          {unpaid.slice(0, 12).map((u) => (
            <div
              key={u.id}
              className="unit-card due"
              style={{ cursor: "pointer" }}
              onClick={() => router.push("/rent")}
            >
              <div>
                <div className="unit-title">
                  <Tag color={u.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                    {u.kind === "shop" ? "Shop" : "Room"}
                  </Tag>
                  <span className="unit-num">{u.room_number}</span>
                </div>
                <div className="unit-rent">{fmt(u.rent)}</div>
              </div>
              <Tag color="red">Due</Tag>
            </div>
          ))}
          {unpaid.length > 12 && (
            <Button size="large" onClick={() => router.push("/rent")} style={{ height: "auto" }}>
              View all {unpaid.length}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
