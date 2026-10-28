"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  type InputRef,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Segmented,
  DatePicker,
  Tag,
  Table,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined, RollbackOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";

type Kind = "room" | "shop";
type Room = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type NewRoom = { kind: Kind; room_number: string; rent?: number; advance?: number };

type ReturnValues = {
  mode: "applied" | "refund";
  amount: number;
  return_date: Dayjs;
  month: Dayjs;
  note?: string;
};

export default function RoomsPage() {
  const { message } = App.useApp();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const [form] = Form.useForm<NewRoom>();
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
    if (error) return message.error(error.message);
    message.success(`${values.kind === "shop" ? "Shop" : "Room"} ${values.room_number} added`);
    form.resetFields(["room_number", "rent", "advance"]);
    inputRef.current?.focus();
    load();
  }

  async function updateField(room: Room, field: "rent" | "advance", value: number) {
    if (Number.isNaN(value) || value === Number(room[field])) return;
    const { error } = await createClient()
      .from("rooms")
      .update({ [field]: value })
      .eq("id", room.id);
    if (error) return message.error(error.message);
    message.success(field === "rent" ? "Rent updated" : "Advance updated");
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
    const label = `${room.kind === "shop" ? "Shop" : "Room"} ${room.room_number}`;
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
          error.code === "23505" ? `Rent for ${values.month.format("MMMM YYYY")} is already paid` : error.message,
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
      room_label: label,
      kind: applied ? "applied" : "refund",
      payment_id: paymentId,
      amount: values.amount,
      return_date: (applied ? dayjs() : values.return_date).format("YYYY-MM-DD"),
      note: values.note?.trim() || (applied ? `Deducted from ${values.month.format("MMM YYYY")} rent` : null),
    });
    setSaving(false);
    if (logError) message.error(logError.message);
    else
      message.success(
        applied
          ? `${values.amount.toLocaleString()} deducted from ${values.month.format("MMMM YYYY")} rent`
          : `${values.amount.toLocaleString()} advance returned`,
      );
    setReturnRoom(null);
    returnForm.resetFields();
    load();
  }

  async function removeRoom(id: string) {
    const { error } = await createClient().from("rooms").delete().eq("id", id);
    if (error) return message.error(error.message);
    message.success("Deleted");
    load();
  }

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Rooms & Shops
      </Typography.Title>
      <p className="page-sub">Add rooms or shops and set their rent and advance.</p>
      <Card className="soft-card" title="Add new" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          className="add-form"
          style={{ rowGap: 12 }}
          onFinish={addRoom}
          initialValues={{ kind: "room" }}
          autoComplete="off"
        >
          <Form.Item name="kind">
            <Segmented
              options={[
                { label: "Room", value: "room" },
                { label: "Shop", value: "shop" },
              ]}
            />
          </Form.Item>
          <Form.Item name="room_number" rules={[{ required: true, message: "Number" }]}>
            <Input ref={inputRef} placeholder="Room / shop number" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="rent">
            <InputNumber placeholder="Rent (optional)" min={0} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="advance">
            <InputNumber placeholder="Advance (optional)" min={0} style={{ width: 180 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />}>
            Add
          </Button>
        </Form>
      </Card>
      <Card className="soft-card" title={`All (${rooms.length})`}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rooms}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            {
              title: "Type",
              dataIndex: "kind",
              render: (k: Kind) =>
                k === "shop" ? <Tag color="purple">Shop</Tag> : <Tag color="blue">Room</Tag>,
            },
            { title: "Number", dataIndex: "room_number" },
            {
              title: "Rent",
              dataIndex: "rent",
              render: (rent: number, room: Room) => (
                <InputNumber
                  key={`${room.id}-${rent}`}
                  min={0}
                  style={{ width: 160 }}
                  defaultValue={rent}
                  onBlur={(e) => updateField(room, "rent", Number(e.target.value))}
                />
              ),
            },
            {
              title: "Advance",
              dataIndex: "advance",
              render: (advance: number, room: Room) => (
                <InputNumber
                  key={`${room.id}-adv-${advance}`}
                  min={0}
                  style={{ width: 160 }}
                  defaultValue={advance}
                  onBlur={(e) => updateField(room, "advance", Number(e.target.value))}
                />
              ),
            },
            {
              title: "",
              render: (_, room: Room) => (
                <Space>
                  <Button
                    size="small"
                    icon={<RollbackOutlined />}
                    disabled={Number(room.advance) <= 0}
                    onClick={() => openReturn(room)}
                  >
                    Use / return advance
                  </Button>
                  <Popconfirm title="Delete this entry?" onConfirm={() => removeRoom(room.id)}>
                    <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={`Advance - ${returnRoom?.kind === "shop" ? "Shop" : "Room"} ${returnRoom?.room_number ?? ""}`}
        open={!!returnRoom}
        onCancel={() => setReturnRoom(null)}
        onOk={() => returnForm.submit()}
        okText={returnMode === "applied" ? "Deduct from rent" : "Return cash"}
        confirmLoading={saving}
        centered
      >
        <p>
          Advance held: <b>{Number(returnRoom?.advance ?? 0).toLocaleString()}</b> · Rent:{" "}
          <b>{Number(returnRoom?.rent ?? 0).toLocaleString()}</b>
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
            <Form.Item
              name="month"
              label="Rent month to settle"
              rules={[{ required: true }]}
            >
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
