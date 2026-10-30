"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, DatePicker, Empty, Progress, Skeleton, Table, Tag } from "antd";
import {
  BankOutlined,
  LeftOutlined,
  MinusCircleOutlined,
  RightOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { useIsMobile } from "@/lib/useIsMobile";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Unit = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type Payment = {
  room_id: string;
  month: string;
  paid_at: string;
  amount: number;
  advance_applied: number;
};
type Dated = { date: string; amount: number };

const fmt = (v: number) => Number(v).toLocaleString();
const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

function sumOf(units: Unit[], paidByUnit: Map<string, number>) {
  const total = units.reduce((s, u) => s + Number(u.rent), 0);
  const paid = units.reduce(
    (s, u) => s + Math.min(paidByUnit.get(u.id) ?? 0, Number(u.rent)),
    0,
  );
  const paidCount = units.filter(
    (u) => Number(u.rent) > 0 && (paidByUnit.get(u.id) ?? 0) >= Number(u.rent),
  ).length;
  return { count: units.length, paidCount, total, paid };
}

function FlowRow({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 24,
        padding: strong ? "12px 0 4px" : "10px 0",
        marginTop: strong ? 8 : 0,
        borderTop: strong ? "1px solid #eceef6" : "none",
        fontWeight: strong ? 800 : 600,
        fontSize: strong ? 18 : 16,
      }}
    >
      <span style={{ color: strong ? "#0f172a" : "#334155", minWidth: 0 }}>{label}</span>
      <span
        style={{
          color,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
        <span style={{ color: "#16a34a", fontWeight: 700 }}>Paid {fmt(data.paid)}</span>
        <span style={{ color: "#e11d48", fontWeight: 700 }}>Due {fmt(data.total - data.paid)}</span>
        <span style={{ color: "#64748b" }}>Total {fmt(data.total)}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [loaded, setLoaded] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transfers, setTransfers] = useState<Dated[]>([]);
  const [expenses, setExpenses] = useState<Dated[]>([]);
  const [utilities, setUtilities] = useState<Dated[]>([]);
  const [moves, setMoves] = useState<(Dated & { dest: string })[]>([]);
  const [cashRefunds, setCashRefunds] = useState<Dated[]>([]);

  // Everything is loaded once; changing the month only re-does the sums below.
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      fetchAll((lo, hi) =>
        supabase
          .from("rooms")
          .select("id, kind, room_number, rent, advance")
          .order("room_number")
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("payments")
          .select("room_id, month, paid_at, amount, advance_applied")
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase.from("bank_transfers").select("amount, transfer_date").order("id").range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase.from("expenses").select("amount, expense_date").order("id").range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase.from("electricity_deposits").select("amount, deposit_date").order("id").range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("advance_moves")
          .select("amount, destination, move_date")
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("advance_returns")
          .select("amount, return_date")
          .eq("kind", "refund")
          .eq("paid_from", "cash")
          .order("id")
          .range(lo, hi),
      ),
    ]).then(([rooms, pays, tr, ex, ut, mv, rf]) => {
      const err =
        rooms.error ?? pays.error ?? tr.error ?? ex.error ?? ut.error ?? mv.error ?? rf.error;
      if (err) message.error(err.message);
      setUnits(rooms.data ?? []);
      setPayments(pays.data ?? []);
      setTransfers((tr.data ?? []).map((r) => ({ date: r.transfer_date, amount: r.amount })));
      setExpenses((ex.data ?? []).map((r) => ({ date: r.expense_date, amount: r.amount })));
      setUtilities((ut.data ?? []).map((r) => ({ date: r.deposit_date, amount: r.amount })));
      setMoves((mv.data ?? []).map((r) => ({ date: r.move_date, amount: r.amount, dest: r.destination })));
      setCashRefunds((rf.data ?? []).map((r) => ({ date: r.return_date, amount: r.amount })));
      setLoaded(true);
    });
  }, [message]);

  const loading = !loaded;
  const key = month.format("YYYY-MM-01");
  const inMonth = (d: string) => dayjs(d).isSame(month, "month");
  const rentOf = (p: Payment) => Number(p.amount) + Number(p.advance_applied);

  // Rent for the selected month. A room can have several payments (part payments).
  const paidByUnit = new Map<string, number>();
  payments
    .filter((p) => p.month === key)
    .forEach((p) => paidByUnit.set(p.room_id, (paidByUnit.get(p.room_id) ?? 0) + rentOf(p)));

  const overall = sumOf(units, paidByUnit);
  const rooms = sumOf(units.filter((u) => u.kind === "room"), paidByUnit);
  const shops = sumOf(units.filter((u) => u.kind === "shop"), paidByUnit);
  const unpaid = units.filter(
    (u) => Number(u.rent) > 0 && (paidByUnit.get(u.id) ?? 0) < Number(u.rent),
  );
  const percent = overall.total ? Math.round((overall.paid / overall.total) * 100) : 0;

  // Balances at the end of any date. Nothing is ever reset: every month starts with what the
  // month before ended with, then adds its own rent and takes off its own spending.
  const cashAt = (end: Dayjs) => {
    const ok = (d: string) => !dayjs(d).isAfter(end);
    return (
      payments.filter((p) => ok(p.paid_at)).reduce((s, p) => s + rentOf(p), 0) -
      sum(transfers.filter((t) => ok(t.date))) -
      sum(expenses.filter((e) => ok(e.date))) +
      // Advance only joins cash or the bank once it is moved; a refund paid out of cash takes it out.
      sum(moves.filter((m) => m.dest === "cash" && ok(m.date))) -
      sum(cashRefunds.filter((r) => ok(r.date)))
    );
  };
  const bankAt = (end: Dayjs) => {
    const ok = (d: string) => !dayjs(d).isAfter(end);
    return (
      sum(transfers.filter((t) => ok(t.date))) +
      sum(moves.filter((m) => m.dest === "bank" && ok(m.date)))
    );
  };
  const netAt = (end: Dayjs) => {
    const ok = (d: string) => !dayjs(d).isAfter(end);
    return (
      payments.filter((p) => ok(p.paid_at)).reduce((s, p) => s + rentOf(p), 0) -
      sum(expenses.filter((e) => ok(e.date)))
    );
  };
  const monthEnd = month.endOf("month");
  const prevEnd = month.subtract(1, "month").endOf("month");
  const cash = cashAt(monthEnd);
  const inBank = bankAt(monthEnd);
  const openingCash = cashAt(prevEnd);
  const openingBank = bankAt(prevEnd);
  const netToDate = netAt(monthEnd);
  const advance = units.reduce((s, u) => s + Number(u.advance), 0);

  // Money movements inside the selected month.
  const collectedM = payments.filter((p) => inMonth(p.paid_at)).reduce((s, p) => s + rentOf(p), 0);
  const expensesM = sum(expenses.filter((e) => inMonth(e.date)));
  const utilitiesM = sum(utilities.filter((u) => inMonth(u.date)));
  const bankM = sum(transfers.filter((t) => inMonth(t.date)));
  const advCashM =
    sum(moves.filter((m) => m.dest === "cash" && inMonth(m.date))) -
    sum(cashRefunds.filter((r) => inMonth(r.date)));
  const advBankM = sum(moves.filter((m) => m.dest === "bank" && inMonth(m.date)));
  const prevName = month.subtract(1, "month").format("MMM");

  const isCurrent = month.isSame(dayjs(), "month");

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${month.format("MMMM YYYY")} overview`}
        extra={
          <div className="month-nav">
            <Button
              icon={<LeftOutlined />}
              onClick={() => setMonth(month.subtract(1, "month"))}
              aria-label="Previous month"
            />
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(d) => d && setMonth(d)}
              format="MMMM YYYY"
              style={{ width: 150 }}
            />
            <Button
              icon={<RightOutlined />}
              onClick={() => setMonth(month.add(1, "month"))}
              aria-label="Next month"
            />
          </div>
        }
      />

      <div className="hero">
        <div className="hero-label">
          Money you have {isCurrent ? "right now" : `at the end of ${month.format("MMMM YYYY")}`}
        </div>
        <div className="hero-amount">{loading ? "..." : fmt(cash + inBank)}</div>
        <div className="hero-grid">
          <div className="hero-mini">
            <span>Cash on hand</span>
            <b>{fmt(cash)}</b>
          </div>
          <div className="hero-mini">
            <span>In bank</span>
            <b>{fmt(inBank)}</b>
          </div>
          <div className="hero-mini">
            <span>Net profit in {month.format("MMM")}</span>
            <b>{fmt(collectedM - expensesM)}</b>
          </div>
          <div className="hero-mini">
            <span>Total net profit</span>
            <b>{fmt(netToDate)}</b>
          </div>
        </div>
      </div>
      <p style={{ color: "#64748b", fontSize: 15, margin: "8px 4px 0" }}>
        Net profit = rent received - expenses. Advance held ({fmt(advance)}) is the tenants&apos; security
        money and is not counted as yours until you move it.
      </p>

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

      <div className="section-title">Cash & bank - each month starts where the last one ended</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
          gap: 12,
        }}
      >
        <Card className="soft-card" title="Cash on hand" loading={loading}>
          <FlowRow label={`Brought forward from ${prevName}`} value={fmt(openingCash)} />
          <FlowRow label="Rent received" value={`+ ${fmt(collectedM)}`} color="#16a34a" />
          <FlowRow label="Expenses" value={`- ${fmt(expensesM)}`} color="#e11d48" />
          <FlowRow label="Sent to bank" value={`- ${fmt(bankM)}`} />
          {advCashM !== 0 && (
            <FlowRow
              label="Advance moved in / refunded"
              value={`${advCashM > 0 ? "+" : "-"} ${fmt(Math.abs(advCashM))}`}
            />
          )}
          <FlowRow
            strong
            label={`Cash on hand (end of ${month.format("MMM")})`}
            value={fmt(cash)}
          />
        </Card>
        <Card className="soft-card" title="In bank" loading={loading}>
          <FlowRow label={`Brought forward from ${prevName}`} value={fmt(openingBank)} />
          <FlowRow label="Sent from cash" value={`+ ${fmt(bankM)}`} color="#4f46e5" />
          {advBankM > 0 && <FlowRow label="Advance moved to bank" value={`+ ${fmt(advBankM)}`} />}
          <FlowRow strong label={`In bank (end of ${month.format("MMM")})`} value={fmt(inBank)} />
        </Card>
      </div>

      <div className="section-title">{month.format("MMMM YYYY")} in numbers</div>
      <div className="unit-list">
        {[
          { label: "Rent due this month", value: overall.total, color: "#0f172a" },
          { label: "Rent received", value: collectedM, color: "#16a34a" },
          { label: "Expenses", value: expensesM, color: "#e11d48" },
          {
            label: "Net income (received - expenses)",
            value: collectedM - expensesM,
            color: collectedM - expensesM >= 0 ? "#16a34a" : "#e11d48",
          },
          { label: "Utilities", value: utilitiesM, color: "#0f172a" },
          { label: "Advance held (tenants' money)", value: advance, color: "#0f172a" },
          { label: "Sent to bank", value: bankM, color: "#4f46e5" },
          { label: "Total money (cash + bank)", value: cash + inBank, color: "#0f172a" },
          {
            label: "Net income to date (all months)",
            value: netToDate,
            color: netToDate >= 0 ? "#16a34a" : "#e11d48",
          },
        ].map((x) => (
          <div key={x.label} className="row-card">
            <span style={{ color: "#64748b" }}>{x.label}</span>
            <b style={{ fontSize: 18, color: x.color }}>{loading ? "..." : fmt(x.value)}</b>
          </div>
        ))}
      </div>

      <div className="section-title">Rent for {month.format("MMMM YYYY")}</div>
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
            <div style={{ color: "#64748b", fontSize: 15 }}>
              {overall.paidCount} of {overall.count} paid - {fmt(overall.total - overall.paid)} still due
            </div>
            <GroupRow label="Rooms" color="#2563eb" data={rooms} />
            <GroupRow label="Shops" color="#9333ea" data={shops} />
          </>
        )}
      </Card>

      <div className="section-title">Waiting for rent {!loading && `(${unpaid.length})`}</div>
      <Card className="soft-card" styles={{ body: { padding: loading || unpaid.length === 0 ? 24 : 0 } }}>
        {loading ? (
          <Skeleton active />
        ) : unpaid.length === 0 ? (
          <Empty
            description={`Everything collected for ${month.format("MMMM YYYY")}`}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : isMobile ? (
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {unpaid.map((u, i) => {
              const part = (paidByUnit.get(u.id) ?? 0) > 0;
              return (
                <div
                  key={u.id}
                  onClick={() => router.push("/rent")}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Tag color={u.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                      {u.kind === "shop" ? "Shop" : "Room"}
                    </Tag>
                    <b>{u.room_number}</b>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <b style={{ color: "#e11d48" }}>{fmt(Number(u.rent) - (paidByUnit.get(u.id) ?? 0))}</b>
                    {part && (
                      <Tag color="orange" style={{ margin: 0 }}>
                        Part
                      </Tag>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <Table<Unit>
            rowKey="id"
            dataSource={unpaid}
            size="small"
            pagination={false}
            scroll={{ y: 520 }}
            onRow={() => ({ onClick: () => router.push("/rent"), style: { cursor: "pointer" } })}
            columns={[
              {
                title: "Type",
                dataIndex: "kind",
                width: 100,
                sorter: (a, b) => a.kind.localeCompare(b.kind),
                render: (k: Kind) => (
                  <Tag color={k === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                    {k === "shop" ? "Shop" : "Room"}
                  </Tag>
                ),
              },
              {
                title: "Name",
                dataIndex: "room_number",
                width: 240,
                sorter: (a, b) =>
                  a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
                render: (v: string) => <b style={{ whiteSpace: "nowrap" }}>{v}</b>,
              },
              { title: "Rent", dataIndex: "rent", align: "right", render: (v: number) => fmt(v) },
              {
                title: "Paid",
                align: "right",
                render: (_, u) =>
                  (paidByUnit.get(u.id) ?? 0) > 0 ? (
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{fmt(paidByUnit.get(u.id) ?? 0)}</span>
                  ) : (
                    <span style={{ color: "#cbd5e1" }}>-</span>
                  ),
              },
              {
                title: "Due",
                align: "right",
                render: (_, u) => (
                  <b style={{ color: "#e11d48" }}>
                    {fmt(Number(u.rent) - (paidByUnit.get(u.id) ?? 0))}
                  </b>
                ),
              },
              {
                title: "Status",
                render: (_, u) =>
                  (paidByUnit.get(u.id) ?? 0) > 0 ? (
                    <Tag color="orange" style={{ margin: 0 }}>
                      Part paid
                    </Tag>
                  ) : (
                    <Tag color="red" style={{ margin: 0 }}>
                      Due
                    </Tag>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
