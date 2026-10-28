"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Tag,
  Upload,
  type UploadFile,
} from "antd";
import { DeleteOutlined, EyeOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

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
const fmt = (v: number) => Number(v).toLocaleString();

export default function ElectricityPage() {
  const { message } = App.useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [filterUnit, setFilterUnit] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
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

  const unitOf = (id: string) => units.find((x) => x.id === id);

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
    setOpen(false);
    form.resetFields();
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
      <PageHeader
        title="Electricity"
        subtitle="Record prepaid meter deposits with the invoice photo."
        extra={
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({ deposit_date: dayjs() });
              setOpen(true);
            }}
          >
            Add deposit
          </Button>
        }
      />

      <Card className="soft-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Total deposited{filterUnit ? ` - ${unitOptions.find((o) => o.value === filterUnit)?.label}` : ""}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{loading ? "..." : fmt(total)}</div>
          </div>
          <Select
            allowClear
            showSearch={{ optionFilterProp: "label" }}
            placeholder="All rooms & shops"
            options={unitOptions}
            value={filterUnit}
            onChange={setFilterUnit}
            style={{ width: 200 }}
          />
        </div>
      </Card>

      {loading ? (
        <Card className="soft-card">
          <Skeleton active />
        </Card>
      ) : shown.length === 0 ? (
        <Card className="soft-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No deposits yet" />
        </Card>
      ) : (
        <div className="row-list">
          {shown.map((d) => {
            const u = unitOf(d.room_id);
            return (
              <div key={d.id} className="row-card">
                <div>
                  <div className="row-title">
                    {u && (
                      <Tag color={u.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                        {u.kind === "shop" ? "Shop" : "Room"}
                      </Tag>
                    )}
                    {u?.room_number ?? "-"}
                  </div>
                  <div className="row-sub">
                    Meter {d.meter_number} - {dayjs(d.deposit_date).format("DD MMM YYYY")}
                  </div>
                </div>
                <div className="row-side">
                  <div className="row-amount">{fmt(d.amount)}</div>
                  {d.invoice_path && (
                    <Button
                      type="text"
                      icon={<EyeOutlined />}
                      onClick={() => viewInvoice(d.invoice_path!)}
                      aria-label="View invoice"
                    />
                  )}
                  <Popconfirm title="Delete this deposit?" onConfirm={() => removeDeposit(d)}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal title="Add electricity deposit" open={open} onCancel={() => setOpen(false)} footer={null} centered destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          onFinish={addDeposit}
          initialValues={{ deposit_date: dayjs() }}
          autoComplete="off"
        >
          <Form.Item name="room_id" label="Room / shop" rules={[{ required: true, message: "Select a room or shop" }]}>
            <Select
              size="large"
              showSearch={{ optionFilterProp: "label" }}
              placeholder="Select"
              options={unitOptions}
              onChange={onUnitChange}
            />
          </Form.Item>
          <Form.Item name="meter_number" label="Meter number" rules={[{ required: true, message: "Enter the meter number" }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="amount" label="Deposit amount" rules={[{ required: true, message: "Enter amount" }]}>
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deposit_date" label="Deposit date" rules={[{ required: true }]}>
            <DatePicker allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="invoice"
            label="Invoice image (optional)"
            valuePropName="fileList"
            getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
          >
            <Upload accept="image/*" maxCount={1} listType="picture" beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>Choose image</Button>
            </Upload>
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={saving} block>
            Add
          </Button>
        </Form>
      </Modal>

      <Modal open={!!preview} footer={null} onCancel={() => setPreview(null)} title="Invoice" centered>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Invoice" style={{ width: "100%" }} />}
      </Modal>
    </>
  );
}
