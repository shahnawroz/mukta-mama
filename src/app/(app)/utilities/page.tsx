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
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Table,
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
import { fetchAll } from "@/lib/fetchAll";
import { useIsMobile } from "@/lib/useIsMobile";
import CompactList from "@/components/CompactList";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Unit = { id: string; kind: Kind; room_number: string };
// One bill is for one meter / holding number, which can serve several rooms and shops.
type Bill = {
  id: string;
  room_id: string;
  room_ids: string[] | null;
  utility_type: string;
  meter_number: string | null;
  holding_number: string | null;
  amount: number;
  deposit_date: string;
  invoice_path: string | null;
};
type FormValues = {
  utility_type: string;
  deposit_date: Dayjs;
  meter_number?: string;
  holding_number?: string;
  room_ids: string[];
  amount: number;
  invoice?: UploadFile[];
};

const MAX_IMAGE_MB = 5;
const DEFAULT_TYPES = ["Electricity", "Gas", "Water", "Internet", "Garbage", "Maintenance", "Security"];
const TAG_COLORS = ["gold", "cyan", "geekblue", "green", "magenta", "orange", "purple", "volcano"];
const fmt = (v: number) => Number(v).toLocaleString();
const norm = (t: string) => t.trim().toLowerCase();
const roomsOf = (b: Bill) => (b.room_ids?.length ? b.room_ids : [b.room_id]);

export default function UtilitiesPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
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
      fetchAll((lo, hi) =>
        supabase
          .from("rooms")
          .select("id, kind, room_number")
          .order("room_number")
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("electricity_deposits")
          .select(
            "id, room_id, room_ids, utility_type, meter_number, holding_number, amount, deposit_date, invoice_path",
          )
          .order("deposit_date", { ascending: false })
          .order("id")
          .range(lo, hi),
      ),
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
  const unitLabel = (id: string) => unitOf(id)?.room_number ?? "-";

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

  // Meter and holding numbers used before, so they can be picked instead of typed again.
  const distinct = (field: "meter_number" | "holding_number") => [
    ...new Set(bills.map((b) => b[field]).filter((v): v is string => !!v)),
  ];

  // Picking a known meter (or holding number) fills in the rest from its latest bill.
  function fillFrom(field: "meter_number" | "holding_number", value: string) {
    const last = bills.find((b) => b[field] === value);
    if (!last) return;
    form.setFieldsValue({
      meter_number: last.meter_number ?? undefined,
      holding_number: last.holding_number ?? undefined,
      room_ids: roomsOf(last),
    });
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
    const utility_type = knownTypes.find((t) => norm(t) === norm(typed)) ?? typed;
    const row = {
      utility_type,
      room_id: values.room_ids[0],
      room_ids: values.room_ids,
      meter_number: values.meter_number?.trim() || null,
      holding_number: values.holding_number?.trim() || null,
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
    message.success(editing ? "Bill updated" : `${utility_type} bill added`);
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
    .filter((b) => !filterUnit || roomsOf(b).includes(filterUnit));
  const total = shown.reduce((s, b) => s + Number(b.amount), 0);
  const initialValues: Partial<FormValues> = editing
    ? {
        utility_type: editing.utility_type,
        deposit_date: dayjs(editing.deposit_date),
        meter_number: editing.meter_number ?? undefined,
        holding_number: editing.holding_number ?? undefined,
        room_ids: roomsOf(editing),
        amount: Number(editing.amount),
        invoice: [],
      }
    : {
        deposit_date: month.isSame(dayjs(), "month") ? dayjs() : month.startOf("month"),
        utility_type: typeFilter !== "all" ? typeFilter : undefined,
        room_ids: [],
      };
  const optionsOf = (kind: Kind) =>
    units.filter((u) => u.kind === kind).map((u) => ({ value: u.id, label: u.room_number }));
  const unitOptions = [
    { label: "Rooms", options: optionsOf("room") },
    { label: "Shops", options: optionsOf("shop") },
  ].filter((g) => g.options.length > 0);
  const typeTotals = new Map(
    usedTypes.map((t) => [
      t,
      monthBills
        .filter((b) => norm(b.utility_type) === norm(t))
        .reduce((s, b) => s + Number(b.amount), 0),
    ]),
  );
  const monthTypes = usedTypes.filter((t) => (typeTotals.get(t) ?? 0) > 0);

  const billActions = (b: Bill) => (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
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
    </span>
  );

  return (
    <>
      <PageHeader
        title="Utilities"
        subtitle="Record any bill you pay for the building, with the invoice photo."
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
            <div style={{ color: "#64748b", fontSize: 15 }}>
              Total {typeFilter === "all" ? "paid" : typeFilter} in {month.format("MMMM YYYY")}
              {filterUnit ? ` - ${unitLabel(filterUnit)}` : ""}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{loading ? "..." : fmt(total)}</div>
            {typeFilter === "all" && monthTypes.length > 1 && (
              <div style={{ fontSize: 15, color: "#64748b", marginTop: 4 }}>
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
      ) : isMobile ? (
        <CompactList
          items={shown.map((b) => {
            const ids = roomsOf(b);
            return {
              key: b.id,
              title: (
                <>
                  <Tag color={colorOf(b.utility_type)} style={{ margin: 0 }}>
                    {b.utility_type}
                  </Tag>
                  <span>{ids.map(unitLabel).join(", ")}</span>
                </>
              ),
              sub: [
                b.meter_number && `Meter ${b.meter_number}`,
                b.holding_number && `Holding ${b.holding_number}`,
                dayjs(b.deposit_date).format("DD MMM YYYY"),
              ]
                .filter(Boolean)
                .join(" - "),
              amount: fmt(b.amount),
              actions: billActions(b),
            };
          })}
        />
      ) : (
        <Card className="soft-card" styles={{ body: { padding: 0 } }}>
          <Table<Bill>
            rowKey="id"
            dataSource={shown}
            size="middle"
            pagination={false}
            columns={[
              {
                title: "Date",
                dataIndex: "deposit_date",
                width: 110,
                defaultSortOrder: "descend",
                sorter: (x, y) => x.deposit_date.localeCompare(y.deposit_date),
                render: (v: string) => dayjs(v).format("DD MMM"),
              },
              {
                title: "Type",
                dataIndex: "utility_type",
                width: 130,
                render: (v: string) => (
                  <Tag color={colorOf(v)} style={{ margin: 0 }}>
                    {v}
                  </Tag>
                ),
              },
              {
                title: "Rooms & shops",
                render: (_, b) => roomsOf(b).map(unitLabel).join(", "),
              },
              { title: "Meter", dataIndex: "meter_number", render: (v: string | null) => v ?? "-" },
              { title: "Holding", dataIndex: "holding_number", render: (v: string | null) => v ?? "-" },
              {
                title: "Amount",
                dataIndex: "amount",
                align: "right",
                sorter: (x, y) => Number(x.amount) - Number(y.amount),
                render: (v: number) => <b>{fmt(v)}</b>,
              },
              { title: "", align: "right", width: 150, render: (_, b) => billActions(b) },
            ]}
          />
        </Card>
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
          preserve={false}
          layout="vertical"
          onFinish={saveBill}
          initialValues={initialValues}
          autoComplete="off"
        >
          <Form.Item
            name="utility_type"
            label="Utility type"
            extra="Type any kind of bill, or pick one from the list."
            rules={[{ required: true, whitespace: true, message: "Enter the utility type" }]}
          >
            <AutoComplete
              size="large"
              options={knownTypes.map((t) => ({ value: t }))}
              placeholder="e.g. Electricity, Internet, Garbage"
              showSearch={{
                filterOption: (input, option) =>
                  (option?.value as string).toLowerCase().includes(input.toLowerCase()),
              }}
            />
          </Form.Item>

          <div className="two-col">
            <Form.Item name="meter_number" label="Meter number">
              <AutoComplete
                size="large"
                options={distinct("meter_number").map((value) => ({ value }))}
                placeholder="Pick or type"
                onSelect={(v: string) => fillFrom("meter_number", v)}
                showSearch={{
                  filterOption: (input, o) =>
                    (o?.value as string).toLowerCase().includes(input.toLowerCase()),
                }}
              />
            </Form.Item>
            <Form.Item name="holding_number" label="Holding number">
              <AutoComplete
                size="large"
                options={distinct("holding_number").map((value) => ({ value }))}
                placeholder="Pick or type"
                onSelect={(v: string) => fillFrom("holding_number", v)}
                showSearch={{
                  filterOption: (input, o) =>
                    (o?.value as string).toLowerCase().includes(input.toLowerCase()),
                }}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="room_ids"
            label="Rooms & shops on this meter"
            extra="Pick every room or shop this bill covers."
            rules={[{ required: true, type: "array", min: 1, message: "Pick at least one room or shop" }]}
          >
            <Select
              size="large"
              mode="multiple"
              showSearch={{ optionFilterProp: "label" }}
              placeholder="Select rooms and shops"
              options={unitOptions}
            />
          </Form.Item>

          <div className="two-col">
            <Form.Item
              name="amount"
              label="Bill amount (total)"
              rules={[{ required: true, message: "Enter amount" }]}
            >
              <InputNumber size="large" min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="deposit_date" label="Date" rules={[{ required: true }]}>
              <DatePicker size="large" allowClear={false} style={{ width: "100%" }} />
            </Form.Item>
          </div>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const count = (getFieldValue("room_ids") as string[] | undefined)?.length ?? 0;
              const amount = getFieldValue("amount") as number | undefined;
              return count > 1 && amount ? (
                <p style={{ color: "#64748b", marginTop: -8 }}>
                  {count} rooms and shops share this bill - about {fmt(Math.round(amount / count))}{" "}
                  each.
                </p>
              ) : null;
            }}
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
