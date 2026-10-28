"use client";

import { useEffect, useState } from "react";
import { App, Card, Col, Empty, Progress, Row, Statistic, Tag, Typography } from "antd";
import { createClient } from "@/lib/supabase/client";
import dayjs from "dayjs";

type Kind = "room" | "shop";
type Unit = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type Payment = { room_id: string; amount: number; advance_applied: number };

type Summary = { count: number; paidCount: number; total: number; paid: number; due: number };

function summarize(units: Unit[], paidByUnit: Map<string, number>): Summary {
  const total = units.reduce((s, u) => s + Number(u.rent), 0);
  const paidUnits = units.filter((u) => paidByUnit.has(u.id));
  const paid = paidUnits.reduce((s, u) => s + (paidByUnit.get(u.id) ?? 0), 0);
  return { count: units.length, paidCount: paidUnits.length, total, paid, due: total - paid };
}

function SummaryCard({
  title,
  color,
  summary,
  loading,
}: {
  title: string;
  color: string;
  summary?: Summary;
  loading: boolean;
}) {
  const percent = summary?.total ? Math.round((summary.paid / summary.total) * 100) : 0;
  return (
    <Card
      className="soft-card"
      loading={loading}
      title={title}
      extra={
        <Typography.Text type="secondary">
          {summary?.paidCount}/{summary?.count} paid
        </Typography.Text>
      }
    >
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <Statistic title="Total" value={summary?.total} />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic title="Paid" value={summary?.paid} styles={{ content: { color: "#16a34a" } }} />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic title="Due" value={summary?.due} styles={{ content: { color: "#e11d48" } }} />
        </Col>
      </Row>
      <Progress percent={percent} strokeColor={color} style={{ marginTop: 12 }} />
    </Card>
  );
}

export default function DashboardPage() {
  const { message } = App.useApp();
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
      supabase
        .from("rooms")
        .select("id, kind, room_number, rent, advance")
        .order("room_number"),
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
  const paidByUnit = new Map(payments.map((p) => [p.room_id, Number(p.amount) + Number(p.advance_applied)]));
  const rooms = all.filter((u) => u.kind === "room");
  const shops = all.filter((u) => u.kind === "shop");
  const unpaid = all.filter((u) => !paidByUnit.has(u.id));
  const advance = all.reduce((s, u) => s + Number(u.advance), 0);

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Dashboard
      </Typography.Title>
      <p className="page-sub">{month.format("MMMM YYYY")} overview</p>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={8}>
          <Card className="soft-card" loading={loading}>
            <Statistic
              title="Cash on hand"
              value={collectedAll - inBank - spent}
              styles={{ content: { color: "#16a34a" } }}
            />
          </Card>
        </Col>
        <Col xs={12} lg={8}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="In bank" value={inBank} styles={{ content: { color: "#4f46e5" } }} />
          </Card>
        </Col>
        <Col xs={12} lg={8}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="Advance held" value={advance} />
          </Card>
        </Col>
        <Col xs={12} lg={8}>
          <Card className="soft-card" loading={loading}>
            <Statistic
              title="Expenses this month"
              value={spentMonth}
              styles={{ content: { color: "#e11d48" } }}
            />
          </Card>
        </Col>
        <Col xs={12} lg={8}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="Electricity this month" value={electricity} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <SummaryCard
            title={`Overall (${all.length} rooms & shops)`}
            color="#4f46e5"
            summary={summarize(all, paidByUnit)}
            loading={loading}
          />
        </Col>
        <Col xs={24} lg={12}>
          <SummaryCard
            title={`Rooms (${rooms.length})`}
            color="#2563eb"
            summary={summarize(rooms, paidByUnit)}
            loading={loading}
          />
        </Col>
        <Col xs={24} lg={12}>
          <SummaryCard
            title={`Shops (${shops.length})`}
            color="#9333ea"
            summary={summarize(shops, paidByUnit)}
            loading={loading}
          />
        </Col>
        <Col xs={24}>
          <Card
            className="soft-card"
            title={`Not collected yet (${unpaid.length})`}
            loading={loading}
          >
            {unpaid.length === 0 ? (
              <Empty description="Everything collected" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {unpaid.map((u) => (
                  <Tag key={u.id} color={u.kind === "shop" ? "purple" : "blue"}>
                    {u.kind === "shop" ? "Shop" : "Room"} {u.room_number}
                    {Number(u.rent) > 0 && ` · ${Number(u.rent).toLocaleString()}`}
                  </Tag>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
