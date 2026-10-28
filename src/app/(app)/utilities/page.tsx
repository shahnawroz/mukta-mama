"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Tag,
  Upload,
  type UploadFile,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Unit = { id: string; kind: Kind; room_number: string };
type Bill = {
  id: string;
  room_id: string;
  utility_type: string;
  meter_number: string | null;
  amount: number;
  deposit_date: string;
  invoice_path: string | null;
};
type FormValues = {
  utility_type: string;
  room_id: string;
  meter_number?: string;
  amount: number;
  deposit_date: Dayjs;
  invoice?: UploadFile[];
};

const MAX_IMAGE_MB = 5;
const DEFAULT_TYPES = ["Electricity", "Gas", "Water"];
const TAG_COLORS = ["gold", "cyan", "geekblue", "green", "magenta", "orange", "purple", "volcano"];
const fmt = (v: number) => Number(v).toLocaleString();
const norm = (t: string) => t.trim().toLowerCase();

export default function UtilitiesPage() {
  const { message } = App.useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [u, d] = await Promise.all([
      supabase.from("rooms").select("id, kind, room_number").order("room_number"),
      supabase
        .from("electricity_deposits")
        .select("id, room_id, utility_type, meter_number, amount, deposit_date, invoice_path")
        .order("deposit_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    const err = u.error ?? d.error;
    if (err) message.error(err.message);
    setUnits(u.data ?? []);
    setBills(d.data ?? []);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const unitOf = (id: string) => units.find((x) => x.id === id);

  // Types already used, plus the usual ones, without duplicates (case-insensitive).
  const knownTypes = (() => {
    const seen = new Map<string, string>();
    [...bills.map((b) => b.utility_type), ...DEFAULT_TYPES].forEach((t) => {
      if (!seen.has(norm(t))) seen.set(norm(t), t);
    });
    return [...seen.values()];
  })();
  const usedTypes = (() => {
    const seen = new Map<string, string>();
    bills.forEach((b) => {
      if (!seen.has(norm(b.utility_type))) seen.set(norm(b.utility_type), b.utility_type);
    });
    return [...seen.values()];
  })();
  const colorOf = (t: string) => {
    const i = usedTypes.findIndex((x) => norm(x) === norm(t));
    return TAG_COLORS[(i < 0 ? 0 : i) % TAG_COLORS.length];
  };

  // Prefill the meter number from the last bill for this room/shop (same type if one is typed).
  function onUnitChange(roomId: string) {
    if (editing) return;
    const type = form.getFieldValue("utility_type") as string | undefined;
    const last = bills.find(
      (b) => b.room_id === roomId && (!type || norm(b.utility_type) === norm(type)),
    );
    if (last?.meter_number) form.setFieldValue("meter_number", last.meter_number);
  }

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(b: Bill) {
    setEditing(b);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  async function saveBill(values: FormValues) {
    const file = values.invoice?.[0]?.originFileObj;
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return message.error(`Image must be smaller than ${MAX_IMAGE_MB}MB`);
    }
    setSaving(true);
    const supabase = createClient();

    let invoice_path: string | null = editing?.invoice_path ?? null;
    let uploadedPath: string | null = null;
    if (file) {
      const { data: auth } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop() || "jpg";
      uploadedPath = `${auth.user!.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("invoices").upload(uploadedPath, file);
      if (error) {
        setSaving(false);
        return message.error(error.message);
      }
      invoice_path = uploadedPath;
    }

    // Reuse the spelling already in use, so "water" and "Water" stay one type.
    const typed = values.utility_type.trim();
    const existing = knownTypes.find((t) => norm(t) === norm(typed));
    const row = {
      utility_type: existing ?? typed,
      room_id: values.room_id,
      meter_number: values.meter_number?.trim() || null,
      amount: values.amount,
      deposit_date: values.deposit_date.format("YYYY-MM-DD"),
      invoice_path,
    };
    const { error } = editing
      ? await supabase.from("electricity_deposits").update(row).eq("id", editing.id)
      : await supabase.from("electricity_deposits").insert(row);
    setSaving(false);
    if (error) {
      if (uploadedPath) await supabase.storage.from("invoices").remove([uploadedPath]);
      return message.error(error.message);
    }
    // A replaced invoice image is no longer needed.
    if (editing?.invoice_path && uploadedPath) {
      await supabase.storage.from("invoices").remove([editing.invoice_path]);
    }
    message.success(editing ? "Bill updated" : `${row.utility_type} bill added`);
    closeModal();
    load();
  }

  async function viewInvoice(path: string) {
    const { data, error } = await createClient().storage.from("invoices").createSignedUrl(path, 300);
    if (error) return message.error(error.message);
    setPreview(data.signedUrl);
  }

  async function removeBill(b: Bill) {
    const supabase = createClient();
    const { error } = await supabase.from("electricity_deposits").delete().eq("id", b.id);
    if (error) return message.error(error.message);
    if (b.invoice_path) await supabase.storage.from("invoices").remove([b.invoice_path]);
    message.success("Deleted");
    load();
  }

  const monthBills = bills.filter((b) => dayjs(b.deposit_date).isSame(month, "month"));
  const shown = monthBills
    .filter((b) => typeFilter === "all" || norm(b.utility_type) === norm(typeFilter))
    .filter((b) => !filterUnit || b.room_id === filterUnit);
  const total = shown.reduce((s, b) => s + Number(b.amount), 0);
  const initialValues = editing
    ? {
        utility_type: editing.utility_type,
        room_id: editing.room_id,
        meter_number: editing.meter_number ?? undefined,
        amount: Number(editing.amount),
        deposit_date: dayjs(editing.deposit_date),
        invoice: [],
      }
    : {
        deposit_date: month.isSame(dayjs(), "month") ? dayjs() : month.startOf("month"),
        utility_type: typeFilter !== "all" ? typeFilter : undefined,
      };
  const unitOptions = units.map((u) => ({
    value: u.id,
    label: `${u.kind === "shop" ? "Shop" : "Room"} ${u.room_number}`,
  }));
  const typeTotals = new Map(
    usedTypes.map((t) => [
      t,
      monthBills
        .filter((b) => norm(b.utility_type) === norm(t))
        .reduce((s, b) => s + Number(b.amount), 0),
    ]),
  );
  const monthTypes = usedTypes.filter((t) => (typeTotals.get(t) ?? 0) > 0);

  return (
    <>
      <PageHeader
        title="Utilities"
        subtitle="Record utility bills (electricity, gas, water and more) with the invoice photo."
        extra={
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openAdd}>
            Add bill
          </Button>
        }
      />

      <div className="toolbar">
        <div className="month-nav">
          <Button icon={<LeftOutlined />} onClick={() => setMonth(month.subtract(1, "month"))} aria-label="Previous month" />
          <DatePicker
            picker="month"
            allowClear={false}
            value={month}
            onChange={(d) => d && setMonth(d)}
            format="MMMM YYYY"
            style={{ width: 150 }}
          />
          <Button icon={<RightOutlined />} onClick={() => setMonth(month.add(1, "month"))} aria-label="Next month" />
        </div>
        {usedTypes.length > 0 && (
          <Segmented
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { label: "All", value: "all" },
              ...usedTypes.map((t) => ({ label: t, value: t })),
            ]}
          />
        )}
      </div>

      <Card className="soft-card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Total {typeFilter === "all" ? "paid" : typeFilter} in {month.format("MMMM YYYY")}
              {filterUnit ? ` - ${unitOptions.find((o) => o.value === filterUnit)?.label}` : ""}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{loading ? "..." : fmt(total)}</div>
            {typeFilter === "all" && monthTypes.length > 1 && (
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                {monthTypes.map((t) => `${t} ${fmt(typeTotals.get(t) ?? 0)}`).join(" - ")}
              </div>
            )}
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
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              bills.length === 0 ? "No bills yet" : `No bills in ${month.format("MMMM YYYY")}`
            }
          />
        </Card>
      ) : (
        <div className="row-list">
          {shown.map((b) => {
            const u = unitOf(b.room_id);
            return (
              <div key={b.id} className="row-card">
                <div>
                  <div className="row-title">
                    <Tag color={colorOf(b.utility_type)} style={{ margin: 0 }}>
                      {b.utility_type}
                    </Tag>
                    {u && (
                      <Tag color={u.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                        {u.kind === "shop" ? "Shop" : "Room"}
                      </Tag>
                    )}
                    {u?.room_number ?? "-"}
                  </div>
                  <div className="row-sub">
                    {b.meter_number ? `Meter ${b.meter_number} - ` : ""}
                    {dayjs(b.deposit_date).format("DD MMM YYYY")}
                  </div>
                </div>
                <div className="row-side">
                  <div className="row-amount">{fmt(b.amount)}</div>
                  <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(b)} aria-label="Edit" />
                  {b.invoice_path && (
                    <Button
                      type="text"
                      icon={<EyeOutlined />}
                      onClick={() => viewInvoice(b.invoice_path!)}
                      aria-label="View invoice"
                    />
                  )}
                  <Popconfirm title="Delete this bill?" onConfirm={() => removeBill(b)}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title={editing ? "Edit bill" : "Add utility bill"}
        open={open}
        onCancel={closeModal}
        footer={null}
        centered
        destroyOnHidden
      >
        <Form
          key={editing?.id ?? "new"}
          form={form}
          layout="vertical"
          onFinish={saveBill}
          initialValues={initialValues}
          autoComplete="off"
        >
          <Form.Item
            name="utility_type"
            label="Utility type"
            extra="Pick one or type your own, for example Electricity, Gas, Water, Internet."
            rules={[{ required: true, whitespace: true, message: "Enter the utility type" }]}
          >
            <AutoComplete
              size="large"
              options={knownTypes.map((t) => ({ value: t }))}
              placeholder="e.g. Electricity"
              filterOption={(input, option) =>
                (option?.value as string).toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item
            name="room_id"
            label="Room / shop"
            rules={[{ required: true, message: "Select a room or shop" }]}
          >
            <Select
              size="large"
              showSearch={{ optionFilterProp: "label" }}
              placeholder="Select"
              options={unitOptions}
              onChange={onUnitChange}
            />
          </Form.Item>
          <Form.Item name="meter_number" label="Meter / account number (optional)">
            <Input size="large" />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: "Enter amount" }]}>
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deposit_date" label="Date" rules={[{ required: true }]}>
            <DatePicker allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="invoice"
            label={editing?.invoice_path ? "Replace invoice image (optional)" : "Invoice image (optional)"}
            valuePropName="fileList"
            getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
          >
            <Upload accept="image/*" maxCount={1} listType="picture" beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>Choose image</Button>
            </Upload>
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={saving} block>
            {editing ? "Save changes" : "Add"}
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
