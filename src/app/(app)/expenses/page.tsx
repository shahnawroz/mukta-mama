"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  type InputRef,
  InputNumber,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";

type Expense = { id: string; amount: number; expense_date: string; note: string };
type FormValues = { amount: number; expense_date: Dayjs; note: string };

export default function ExpensesPage() {
  const { message } = App.useApp();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [month, setMonth] = useState<Dayjs | null>(dayjs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    message.success(`Expense of ${values.amount.toLocaleString()} added`);
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

  const shown = month
    ? expenses.filter((e) => dayjs(e.expense_date).isSame(month, "month"))
    : expenses;
  const shownTotal = shown.reduce((s, e) => s + Number(e.amount), 0);
  const allTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Expenses
      </Typography.Title>
      <p className="page-sub">Money spent from the rent you collected. It comes out of cash on hand.</p>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12}>
          <Card className="soft-card" loading={loading}>
            <Statistic
              title={month ? `${month.format("MMMM YYYY")}` : "Shown"}
              value={shownTotal}
              styles={{ content: { color: "#e11d48" } }}
            />
          </Card>
        </Col>
        <Col xs={12}>
          <Card className="soft-card" loading={loading}>
            <Statistic title="All time" value={allTotal} />
          </Card>
        </Col>
      </Row>

      <Card className="soft-card" title="Add expense" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          className="add-form"
          style={{ rowGap: 12 }}
          onFinish={addExpense}
          initialValues={{ expense_date: dayjs() }}
          autoComplete="off"
        >
          <Form.Item name="note" rules={[{ required: true, message: "What was it for?" }]}>
            <Input ref={noteRef} placeholder="What was it for? e.g. Plumber" style={{ width: 260 }} />
          </Form.Item>
          <Form.Item name="amount" rules={[{ required: true, message: "Amount" }]}>
            <InputNumber placeholder="Amount" min={1} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="expense_date" rules={[{ required: true, message: "Date" }]}>
            <DatePicker allowClear={false} style={{ width: 160 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />}>
            Add
          </Button>
        </Form>
      </Card>

      <Card
        className="soft-card"
        title={`Expenses (${shown.length})`}
        extra={
          <Space>
            <DatePicker picker="month" value={month} onChange={setMonth} placeholder="All months" />
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={shown}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            {
              title: "Date",
              dataIndex: "expense_date",
              render: (v: string) => dayjs(v).format("DD MMM YYYY"),
            },
            { title: "Note", dataIndex: "note" },
            {
              title: "Amount",
              dataIndex: "amount",
              render: (v: number) => Number(v).toLocaleString(),
            },
            {
              title: "",
              render: (_, e: Expense) => (
                <Popconfirm title="Delete this expense?" onConfirm={() => removeExpense(e.id)}>
                  <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
