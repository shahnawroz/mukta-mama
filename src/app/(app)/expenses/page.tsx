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
import { DeleteOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
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
  const [editing, setEditing] = useState<Expense | null>(null);
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

  function openAdd() {
    setEditing(null);
    setOpen(true);
    setTimeout(() => noteRef.current?.focus(), 100);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  async function saveExpense(values: FormValues) {
    setSaving(true);
    const row = {
      amount: values.amount,
      expense_date: values.expense_date.format("YYYY-MM-DD"),
      note: values.note.trim(),
    };
    const supabase = createClient();
    const { error } = editing
      ? await supabase.from("expenses").update(row).eq("id", editing.id)
      : await supabase.from("expenses").insert(row);
    setSaving(false);
    if (error) return message.error(error.message);
    if (editing) {
      message.success("Expense updated");
      closeModal();
    } else {
      message.success(`Expense of ${fmt(values.amount)} added`);
      form.resetFields(["amount", "note"]);
      noteRef.current?.focus();
    }
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
  const initialValues = editing
    ? {
        note: editing.note,
        amount: Number(editing.amount),
        expense_date: dayjs(editing.expense_date),
      }
    : { expense_date: month.isSame(dayjs(), "month") ? dayjs() : month.startOf("month") };

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
            onClick={openAdd}
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
                <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(e)} aria-label="Edit" />
                <Popconfirm title="Delete this expense?" onConfirm={() => removeExpense(e.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={editing ? "Edit expense" : "Add expense"}
        open={open}
        onCancel={closeModal}
        footer={null}
        centered
        destroyOnHidden
      >
        {!editing && (
          <p style={{ color: "#64748b", marginTop: 0 }}>
            After you add one, the form clears so you can add the next. Close it when you are done.
          </p>
        )}
        <Form
          key={editing?.id ?? "new"}
          form={form}
          layout="vertical"
          onFinish={saveExpense}
          initialValues={initialValues}
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
            {editing ? "Save changes" : "Add"}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
