"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Popconfirm,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  kind: "room" | "shop";
  room_number: string;
  rent: number;
  payment_id: string | null;
  paid_at: string | null;
};

export default function RentPage() {
  const { message } = App.useApp();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "room" | "shop">("all");

  const monthKey = month.format("YYYY-MM-01");

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [rooms, payments] = await Promise.all([
      supabase.from("rooms").select("id, kind, room_number, rent")
        .order("kind", { ascending: false })
        .order("room_number"),
      supabase.from("payments").select("id, room_id, paid_at").eq("month", monthKey),
    ]);
    const err = rooms.error ?? payments.error;
    if (err) message.error(err.message);
    const paid = new Map((payments.data ?? []).map((p) => [p.room_id, p]));
    setRows(
      (rooms.data ?? []).map((r) => ({
        ...r,
        payment_id: paid.get(r.id)?.id ?? null,
        paid_at: paid.get(r.id)?.paid_at ?? null,
      })),
    );
    setLoading(false);
  }, [monthKey, message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function markPaid(row: Row) {
    const { error } = await createClient().from("payments").insert({
      room_id: row.id,
      month: monthKey,
      amount: row.rent,
      paid_at: new Date().toISOString(),
    });
    if (error) return message.error(error.message);
    message.success(`${row.room_number} marked as paid`);
    load();
  }

  async function markDue(row: Row) {
    const { error } = await createClient()
      .from("payments")
      .delete()
      .eq("id", row.payment_id!);
    if (error) return message.error(error.message);
    message.success(`${row.room_number} marked as due`);
    load();
  }

  const visible = rows.filter((r) => filter === "all" || r.kind === filter);

  const paidRows = visible.filter((r) => r.paid_at);
  const paidTotal = paidRows.reduce((s, r) => s + Number(r.rent), 0);
  const dueTotal = visible.reduce((s, r) => s + Number(r.rent), 0) - paidTotal;

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Rent
      </Typography.Title>
      <p className="page-sub">Tap Paid when rent is received. The date is saved automatically.</p>
      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All", value: "all" },
            { label: "Rooms", value: "room" },
            { label: "Shops", value: "shop" },
          ]}
        />
        <DatePicker
          picker="month"
          allowClear={false}
          value={month}
          onChange={(d) => d && setMonth(d)}
        />
      </Space>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12}>
          <Card className="soft-card">
            <Statistic
              title={`Paid (${paidRows.length})`}
              value={paidTotal}
              styles={{ content: { color: "#16a34a" } }}
            />
          </Card>
        </Col>
        <Col xs={12}>
          <Card className="soft-card">
            <Statistic
              title={`Due (${visible.length - paidRows.length})`}
              value={dueTotal}
              styles={{ content: { color: "#e11d48" } }}
            />
          </Card>
        </Col>
      </Row>
      <Card className="soft-card">
      <Table
        rowKey="id"
        loading={loading}
        dataSource={visible}
        pagination={false}
        scroll={{ x: true }}
        columns={[
          {
            title: "Type",
            dataIndex: "kind",
            render: (k: Row["kind"]) =>
              k === "shop" ? <Tag color="purple">Shop</Tag> : <Tag color="blue">Room</Tag>,
          },
          { title: "Number", dataIndex: "room_number" },
          { title: "Rent", dataIndex: "rent" },
          {
            title: "Status",
            render: (_, row: Row) =>
              row.paid_at ? <Tag color="green">Paid</Tag> : <Tag color="red">Due</Tag>,
          },
          {
            title: "Paid date",
            dataIndex: "paid_at",
            render: (v: string | null) => (v ? dayjs(v).format("DD MMM YYYY") : "-"),
          },
          {
            title: "",
            render: (_, row: Row) =>
              row.paid_at ? (
                <Popconfirm title="Mark as due again?" onConfirm={() => markDue(row)}>
                  <Button size="small">Undo</Button>
                </Popconfirm>
              ) : (
                <Button type="primary" size="small" onClick={() => markPaid(row)}>
                  Paid
                </Button>
              ),
          },
        ]}
      />
      </Card>
    </>
  );
}
