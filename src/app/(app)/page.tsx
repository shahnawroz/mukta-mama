"use client";

import { useEffect, useState } from "react";
import { App, Card, Col, Progress, Row, Statistic, Typography } from "antd";
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  rooms: number;
  shops: number;
  total: number;
  advance: number;
  paid: number;
  count: number;
  collected: number;
};

function StatCard({
  title,
  value,
  icon,
  color,
  bg,
  suffix,
  loading,
}: {
  title: string;
  value?: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  suffix?: string;
  loading: boolean;
}) {
  return (
    <Card className="soft-card" loading={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Statistic title={title} value={value} suffix={suffix} />
        <div className="stat-icon" style={{ color, background: bg }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { message } = App.useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const month = dayjs();

  useEffect(() => {
    const key = dayjs().format("YYYY-MM-01");
    const supabase = createClient();
    Promise.all([
      supabase.from("rooms").select("kind, rent, advance"),
      supabase.from("payments").select("amount").eq("month", key),
    ]).then(([rooms, payments]) => {
      const err = rooms.error ?? payments.error;
      if (err) return message.error(err.message);
      const r = rooms.data ?? [];
      const p = payments.data ?? [];
      setStats({
        rooms: r.filter((x) => x.kind === "room").length,
        shops: r.filter((x) => x.kind === "shop").length,
        total: r.reduce((s, x) => s + Number(x.rent), 0),
        advance: r.reduce((s, x) => s + Number(x.advance), 0),
        paid: p.length,
        count: r.length,
        collected: p.reduce((s, x) => s + Number(x.amount), 0),
      });
    });
  }, [message]);

  const loading = stats === null;
  const due = (stats?.total ?? 0) - (stats?.collected ?? 0);
  const percent = stats?.total ? Math.round((stats.collected / stats.total) * 100) : 0;

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Dashboard
      </Typography.Title>
      <p className="page-sub">{month.format("MMMM YYYY")} overview</p>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Rooms / Shops"
            value={stats?.count}
            suffix={stats ? `(${stats.rooms} + ${stats.shops})` : undefined}
            icon={<AppstoreOutlined />}
            color="#4f46e5"
            bg="#eef2ff"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Monthly rent"
            value={stats?.total}
            icon={<DollarOutlined />}
            color="#0891b2"
            bg="#ecfeff"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Collected"
            value={stats?.collected}
            icon={<CheckCircleOutlined />}
            color="#16a34a"
            bg="#f0fdf4"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Due"
            value={due}
            icon={<ClockCircleOutlined />}
            color="#e11d48"
            bg="#fff1f2"
            loading={loading}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card className="soft-card" title="Collection this month" loading={loading}>
            <Progress percent={percent} strokeColor="#4f46e5" />
            <Typography.Text type="secondary">
              {stats?.paid} of {stats?.count} paid
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card className="soft-card" title="Advance held" loading={loading}>
            <Statistic value={stats?.advance} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
