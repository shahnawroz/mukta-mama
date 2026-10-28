"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  type InputRef,
  InputNumber,
  Modal,
  Popconfirm,
  Skeleton,
} from "antd";
import { DeleteOutlined, LeftOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

type Expense = { id: string; amount: number; expense_date: string; note: string };
type FormValues = { amount: number; expense_date: Dayjs; note: string };

const fmt = (v: number) => Number(v).toLocaleString();

export default function ExpensesPage() {
  const { message } = App.useApp();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const noteRef = useRef<InputRef>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("expenses")
      .select("id, amount, expense_date, note")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) message.error(error.message);
    else setExpenses(data ?? []);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function addExpense(values: FormValues) {
    setSaving(true);
    const { error } = await createClient()
      .from("expenses")
      .insert({
        amount: values.amount,
        expense_date: values.expense_date.format("YYYY-MM-DD"),
        note: values.note.trim(),
      });
    setSaving(false);
    if (error) return message.error(error.message);
    message.success(`Expense of ${fmt(values.amount)} added`);
    form.resetFields(["amount", "note"]);
    noteRef.current?.focus();
    load();
  }

  async function removeExpense(id: string) {
    const { error } = await createClient().from("expenses").delete().eq("id", id);
    if (error) return message.error(error.message);
    message.success("Expense deleted");
    load();
  }

  const shown = expenses.filter((e) => dayjs(e.expense_date).isSame(month, "month"));
  const monthTotal = shown.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Money spent from the rent you collected. It comes out of cash on hand."
        extra={
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              setOpen(true);
              setTimeout(() => noteRef.current?.focus(), 100);
            }}
          >
            Add expense
          </Button>
        }
      />

      <Card className="soft-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 13 }}>Spent in {month.format("MMMM YYYY")}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e11d48" }}>
              {loading ? "..." : fmt(monthTotal)}
            </div>
          </div>
          <div className="month-nav">
            <Button icon={<LeftOutlined />} onClick={() => setMonth(month.subtract(1, "month"))} />
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(d) => d && setMonth(d)}
              format="MMM YYYY"
              style={{ width: 120 }}
            />
            <Button icon={<RightOutlined />} onClick={() => setMonth(month.add(1, "month"))} />
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="soft-card">
          <Skeleton active />
        </Card>
      ) : shown.length === 0 ? (
        <Card className="soft-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`No expenses in ${month.format("MMMM YYYY")}`}
          />
        </Card>
      ) : (
        <div className="row-list">
          {shown.map((e) => (
            <div key={e.id} className="row-card">
              <div>
                <div className="row-title">{e.note}</div>
                <div className="row-sub">{dayjs(e.expense_date).format("DD MMM YYYY")}</div>
              </div>
              <div className="row-side">
                <div className="row-amount out">-{fmt(e.amount)}</div>
                <Popconfirm title="Delete this expense?" onConfirm={() => removeExpense(e.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal title="Add expense" open={open} onCancel={() => setOpen(false)} footer={null} centered destroyOnHidden>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          After you add one, the form clears so you can add the next. Close it when you are done.
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={addExpense}
          initialValues={{ expense_date: dayjs() }}
          autoComplete="off"
        >
          <Form.Item
            name="note"
            label="What was it for?"
            rules={[{ required: true, message: "Enter what it was for" }]}
          >
            <Input ref={noteRef} size="large" placeholder="e.g. Plumber, repair, cleaning" />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: "Enter amount" }]}>
            <InputNumber size="large" min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="expense_date" label="Date" rules={[{ required: true }]}>
            <DatePicker allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={saving} block>
            Add
          </Button>
        </Form>
      </Modal>
    </>
  );
}
