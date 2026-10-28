"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
  type UploadFile,
} from "antd";
import { DeleteOutlined, EyeOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";

type Kind = "room" | "shop";
type Unit = { id: string; kind: Kind; room_number: string };
type Deposit = {
  id: string;
  room_id: string;
  meter_number: string;
  amount: number;
  deposit_date: string;
  invoice_path: string | null;
};
type FormValues = {
  room_id: string;
  meter_number: string;
  amount: number;
  deposit_date: Dayjs;
  invoice?: UploadFile[];
};

const MAX_IMAGE_MB = 5;

export default function ElectricityPage() {
  const { message } = App.useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [filterUnit, setFilterUnit] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [u, d] = await Promise.all([
      supabase.from("rooms").select("id, kind, room_number").order("room_number"),
      supabase
        .from("electricity_deposits")
        .select("id, room_id, meter_number, amount, deposit_date, invoice_path")
        .order("deposit_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    const err = u.error ?? d.error;
    if (err) message.error(err.message);
    setUnits(u.data ?? []);
    setDeposits(d.data ?? []);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const unitLabel = (id: string) => {
    const u = units.find((x) => x.id === id);
    return u ? `${u.kind === "shop" ? "Shop" : "Room"} ${u.room_number}` : "-";
  };

  // Prefill the meter number from the last deposit for this room/shop.
  function onUnitChange(roomId: string) {
    const last = deposits.find((d) => d.room_id === roomId);
    if (last) form.setFieldValue("meter_number", last.meter_number);
  }

  async function addDeposit(values: FormValues) {
    const file = values.invoice?.[0]?.originFileObj;
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return message.error(`Image must be smaller than ${MAX_IMAGE_MB}MB`);
    }
    setSaving(true);
    const supabase = createClient();

    let invoice_path: string | null = null;
    if (file) {
      const { data: auth } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop() || "jpg";
      invoice_path = `${auth.user!.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("invoices").upload(invoice_path, file);
      if (error) {
        setSaving(false);
        return message.error(error.message);
      }
    }

    const { error } = await supabase.from("electricity_deposits").insert({
      room_id: values.room_id,
      meter_number: values.meter_number,
      amount: values.amount,
      deposit_date: values.deposit_date.format("YYYY-MM-DD"),
      invoice_path,
    });
    setSaving(false);
    if (error) {
      if (invoice_path) await supabase.storage.from("invoices").remove([invoice_path]);
      return message.error(error.message);
    }
    message.success("Electricity deposit added");
    form.resetFields(["amount", "invoice"]);
    form.setFieldValue("deposit_date", dayjs());
    load();
  }

  async function viewInvoice(path: string) {
    const { data, error } = await createClient().storage.from("invoices").createSignedUrl(path, 300);
    if (error) return message.error(error.message);
    setPreview(data.signedUrl);
  }

  async function removeDeposit(d: Deposit) {
    const supabase = createClient();
    const { error } = await supabase.from("electricity_deposits").delete().eq("id", d.id);
    if (error) return message.error(error.message);
    if (d.invoice_path) await supabase.storage.from("invoices").remove([d.invoice_path]);
    message.success("Deleted");
    load();
  }

  const shown = deposits.filter((d) => !filterUnit || d.room_id === filterUnit);
  const total = shown.reduce((s, d) => s + Number(d.amount), 0);
  const unitOptions = units.map((u) => ({
    value: u.id,
    label: `${u.kind === "shop" ? "Shop" : "Room"} ${u.room_number}`,
  }));

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Electricity
      </Typography.Title>
      <p className="page-sub">Record prepaid meter deposits with the invoice photo.</p>

      <Card className="soft-card" title="Add deposit" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          className="add-form"
          style={{ rowGap: 12 }}
          onFinish={addDeposit}
          initialValues={{ deposit_date: dayjs() }}
          autoComplete="off"
        >
          <Form.Item name="room_id" rules={[{ required: true, message: "Select room / shop" }]}>
            <Select
              showSearch={{ optionFilterProp: "label" }}
              placeholder="Room / shop"
              options={unitOptions}
              onChange={onUnitChange}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item name="meter_number" rules={[{ required: true, message: "Meter number" }]}>
            <Input placeholder="Meter number" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="amount" rules={[{ required: true, message: "Amount" }]}>
            <InputNumber placeholder="Deposit amount" min={0} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="deposit_date" rules={[{ required: true, message: "Date" }]}>
            <DatePicker allowClear={false} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            name="invoice"
            valuePropName="fileList"
            getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
          >
            <Upload
              accept="image/*"
              maxCount={1}
              listType="picture"
              beforeUpload={() => false}
            >
              <Button icon={<UploadOutlined />}>Invoice image</Button>
            </Upload>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />}>
            Add
          </Button>
        </Form>
      </Card>

      <Card
        className="soft-card"
        title={`Deposits (${shown.length})`}
        extra={
          <Select
            allowClear
            showSearch={{ optionFilterProp: "label" }}
            placeholder="All rooms & shops"
            options={unitOptions}
            value={filterUnit}
            onChange={setFilterUnit}
            style={{ width: 180 }}
          />
        }
      >
        <Statistic title="Total deposited" value={total} style={{ marginBottom: 16 }} />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={shown}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            {
              title: "Date",
              dataIndex: "deposit_date",
              render: (v: string) => dayjs(v).format("DD MMM YYYY"),
            },
            {
              title: "Room / Shop",
              dataIndex: "room_id",
              render: (id: string) => <Tag>{unitLabel(id)}</Tag>,
            },
            { title: "Meter no.", dataIndex: "meter_number" },
            {
              title: "Amount",
              dataIndex: "amount",
              render: (v: number) => Number(v).toLocaleString(),
            },
            {
              title: "Invoice",
              dataIndex: "invoice_path",
              render: (path: string | null) =>
                path ? (
                  <Button size="small" icon={<EyeOutlined />} onClick={() => viewInvoice(path)}>
                    View
                  </Button>
                ) : (
                  "-"
                ),
            },
            {
              title: "",
              render: (_, d: Deposit) => (
                <Popconfirm title="Delete this deposit?" onConfirm={() => removeDeposit(d)}>
                  <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={!!preview} footer={null} onCancel={() => setPreview(null)} title="Invoice" centered>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Invoice" style={{ width: "100%" }} />}
      </Modal>
    </>
  );
}
