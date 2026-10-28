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
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RollbackOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Room = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type NewRoom = { kind: Kind; room_number: string; rent?: number; advance?: number };
type EditValues = { rent: number; advance: number };
type ReturnValues = {
  mode: "applied" | "refund";
  amount: number;
  return_date: Dayjs;
  month: Dayjs;
  note?: string;
};

const fmt = (v: number) => Number(v).toLocaleString();
const labelOf = (r: { kind: Kind; room_number: string }) =>
  `${r.kind === "shop" ? "Shop" : "Room"} ${r.room_number}`;

export default function RoomsPage() {
  const { message } = App.useApp();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const numberRef = useRef<InputRef>(null);
  const [form] = Form.useForm<NewRoom>();

  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editForm] = Form.useForm<EditValues>();

  const [returnRoom, setReturnRoom] = useState<Room | null>(null);
  const [returnForm] = Form.useForm<ReturnValues>();
  const returnMode = Form.useWatch("mode", returnForm);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("rooms")
      .select("id, kind, room_number, rent, advance")
      .order("kind", { ascending: false })
      .order("room_number");
    if (error) message.error(error.message);
    else setRooms(data ?? []);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function addRoom(values: NewRoom) {
    setSaving(true);
    const { error } = await createClient()
      .from("rooms")
      .insert({ ...values, rent: values.rent ?? 0, advance: values.advance ?? 0 });
    setSaving(false);
    if (error) {
      return message.error(
        error.code === "23505" ? `${labelOf(values)} already exists` : error.message,
      );
    }
    message.success(`${labelOf(values)} added`);
    form.resetFields(["room_number", "rent", "advance"]);
    numberRef.current?.focus();
    load();
  }

  function openEdit(room: Room) {
    editForm.setFieldsValue({ rent: Number(room.rent), advance: Number(room.advance) });
    setEditRoom(room);
  }

  async function saveEdit(values: EditValues) {
    const room = editRoom!;
    setSaving(true);
    const { error } = await createClient()
      .from("rooms")
      .update({ rent: values.rent ?? 0, advance: values.advance ?? 0 })
      .eq("id", room.id);
    setSaving(false);
    if (error) return message.error(error.message);
    message.success(`${labelOf(room)} updated`);
    setEditRoom(null);
    load();
  }

  function openReturn(room: Room) {
    const mode = room.kind === "room" ? "applied" : "refund";
    returnForm.setFieldsValue({
      mode,
      amount: mode === "applied" ? Math.min(Number(room.advance), Number(room.rent)) : undefined,
      return_date: dayjs(),
      month: dayjs(),
    });
    setReturnRoom(room);
  }

  function onModeChange(mode: "applied" | "refund") {
    const room = returnRoom!;
    returnForm.setFieldValue(
      "amount",
      mode === "applied" ? Math.min(Number(room.advance), Number(room.rent)) : undefined,
    );
  }

  async function returnAdvance(values: ReturnValues) {
    const room = returnRoom!;
    const supabase = createClient();
    const applied = values.mode === "applied";
    setSaving(true);

    let paymentId: string | null = null;
    if (applied) {
      // Settle (part of) that month's rent from the advance; the rest is cash from the tenant.
      const month = values.month.format("YYYY-MM-01");
      const { data: auth } = await supabase.auth.getUser();
      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          room_id: room.id,
          month,
          amount: Number(room.rent) - values.amount,
          advance_applied: values.amount,
          paid_at: new Date().toISOString(),
          paid_by: auth.user?.email ?? "admin",
        })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        return message.error(
          error.code === "23505"
            ? `Rent for ${values.month.format("MMMM YYYY")} is already paid`
            : error.message,
        );
      }
      paymentId = payment.id;
    }

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ advance: Number(room.advance) - values.amount })
      .eq("id", room.id);
    if (updateError) {
      if (paymentId) await supabase.from("payments").delete().eq("id", paymentId);
      setSaving(false);
      return message.error(updateError.message);
    }

    const { error: logError } = await supabase.from("advance_returns").insert({
      room_id: room.id,
      room_label: labelOf(room),
      kind: applied ? "applied" : "refund",
      payment_id: paymentId,
      amount: values.amount,
      return_date: (applied ? dayjs() : values.return_date).format("YYYY-MM-DD"),
      note:
        values.note?.trim() ||
        (applied ? `Deducted from ${values.month.format("MMM YYYY")} rent` : null),
    });
    setSaving(false);
    if (logError) message.error(logError.message);
    else
      message.success(
        applied
          ? `${fmt(values.amount)} deducted from ${values.month.format("MMMM YYYY")} rent`
          : `${fmt(values.amount)} advance returned`,
      );
    setReturnRoom(null);
    returnForm.resetFields();
    load();
  }

  async function removeRoom(room: Room) {
    const { error } = await createClient().from("rooms").delete().eq("id", room.id);
    if (error) return message.error(error.message);
    message.success(`${labelOf(room)} deleted`);
    load();
  }

  const q = search.trim().toLowerCase();
  const visible = rooms
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => !q || r.room_number.toLowerCase().includes(q));
  const roomCount = rooms.filter((r) => r.kind === "room").length;
  const shopCount = rooms.length - roomCount;

  return (
    <>
      <PageHeader
        title="Rooms & Shops"
        subtitle={`${roomCount} rooms, ${shopCount} shops`}
        extra={
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              setAddOpen(true);
              setTimeout(() => numberRef.current?.focus(), 100);
            }}
          >
            Add room / shop
          </Button>
        }
      />

      <div className="toolbar">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { label: "All", value: "all" },
            { label: "Rooms", value: "room" },
            { label: "Shops", value: "shop" },
          ]}
        />
        <Input
          className="grow"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Card className="soft-card">
          <Skeleton active />
        </Card>
      ) : visible.length === 0 ? (
        <Card className="soft-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={rooms.length === 0 ? "Nothing here yet" : "Nothing matches"}
          >
            {rooms.length === 0 && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
                Add your first room or shop
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="unit-list">
          {visible.map((r) => (
            <div key={r.id} className="unit-card plain">
              <div>
                <div className="unit-title">
                  <Tag color={r.kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
                    {r.kind === "shop" ? "Shop" : "Room"}
                  </Tag>
                  <span className="unit-num">{r.room_number}</span>
                </div>
                <div className="unit-stats">
                  <span>
                    Rent <b>{fmt(r.rent)}</b>
                  </span>
                  <span>
                    Advance <b>{fmt(r.advance)}</b>
                  </span>
                </div>
              </div>
              <div className="unit-tools">
                <Tooltip title="Edit rent / advance">
                  <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                </Tooltip>
                <Tooltip title="Use / return advance">
                  <Button
                    type="text"
                    icon={<RollbackOutlined />}
                    disabled={Number(r.advance) <= 0}
                    onClick={() => openReturn(r)}
                  />
                </Tooltip>
                <Popconfirm title={`Delete ${labelOf(r)}?`} onConfirm={() => removeRoom(r)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="Add room or shop"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={null}
        centered
        destroyOnHidden
      >
        <p style={{ color: "#64748b", marginTop: 0 }}>
          After you add one, the form clears so you can add the next. Close it when you are done.
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={addRoom}
          initialValues={{ kind: "room" }}
          autoComplete="off"
        >
          <Form.Item name="kind">
            <Segmented
              block
              options={[
                { label: "Room", value: "room" },
                { label: "Shop", value: "shop" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="room_number"
            label="Number"
            rules={[{ required: true, message: "Enter the room or shop number" }]}
          >
            <Input ref={numberRef} size="large" placeholder="e.g. 101" />
          </Form.Item>
          <Form.Item name="rent" label="Monthly rent (optional)">
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="advance" label="Advance taken (optional)">
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={saving} block>
            Add
          </Button>
        </Form>
      </Modal>

      <Modal
        title={editRoom ? `Edit ${labelOf(editRoom)}` : ""}
        open={!!editRoom}
        onCancel={() => setEditRoom(null)}
        onOk={() => editForm.submit()}
        okText="Save"
        confirmLoading={saving}
        centered
      >
        <Form form={editForm} layout="vertical" onFinish={saveEdit} autoComplete="off">
          <Form.Item name="rent" label="Monthly rent">
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="advance" label="Advance held">
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={returnRoom ? `Advance - ${labelOf(returnRoom)}` : ""}
        open={!!returnRoom}
        onCancel={() => setReturnRoom(null)}
        onOk={() => returnForm.submit()}
        okText={returnMode === "applied" ? "Deduct from rent" : "Return cash"}
        confirmLoading={saving}
        centered
      >
        <p>
          Advance held: <b>{fmt(returnRoom?.advance ?? 0)}</b> - Rent:{" "}
          <b>{fmt(returnRoom?.rent ?? 0)}</b>
        </p>
        <Form form={returnForm} layout="vertical" onFinish={returnAdvance} autoComplete="off">
          <Form.Item name="mode">
            <Segmented
              block
              onChange={onModeChange}
              options={[
                { label: "Deduct from rent", value: "applied" },
                { label: "Return cash", value: "refund" },
              ]}
            />
          </Form.Item>
          {returnMode === "applied" ? (
            <Form.Item name="month" label="Rent month to settle" rules={[{ required: true }]}>
              <DatePicker picker="month" allowClear={false} style={{ width: "100%" }} />
            </Form.Item>
          ) : (
            <Form.Item name="return_date" label="Date" rules={[{ required: true }]}>
              <DatePicker allowClear={false} style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item
            name="amount"
            label={returnMode === "applied" ? "Amount deducted" : "Amount returned"}
            extra={
              returnMode === "applied"
                ? "If this is less than the rent, the tenant pays the rest in cash."
                : "Security money handed back. It does not change cash on hand."
            }
            rules={[
              { required: true, message: "Enter amount" },
              {
                validator: (_, v: number | undefined) => {
                  if (v == null) return Promise.resolve();
                  if (v > Number(returnRoom?.advance ?? 0))
                    return Promise.reject(new Error("More than the advance held"));
                  if (returnMode === "applied" && v > Number(returnRoom?.rent ?? 0))
                    return Promise.reject(new Error("More than the monthly rent"));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input placeholder="e.g. Tenant moved out" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
