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
  Popconfirm,
  Segmented,
  Tag,
  Table,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";

type Kind = "room" | "shop";
type Room = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type NewRoom = { kind: Kind; room_number: string; rent?: number; advance?: number };

export default function RoomsPage() {
  const { message } = App.useApp();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const [form] = Form.useForm<NewRoom>();

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
    const { error } = await createClient().from("rooms").insert({ ...values, rent: values.rent ?? 0, advance: values.advance ?? 0 });
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
                <Popconfirm title="Delete this entry?" onConfirm={() => removeRoom(room.id)}>
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
