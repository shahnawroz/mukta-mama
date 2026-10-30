"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  type InputRef,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Skeleton,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { useIsMobile } from "@/lib/useIsMobile";
import PageHeader from "@/components/PageHeader";

type Kind = "room" | "shop";
type Room = { id: string; kind: Kind; room_number: string; rent: number; advance: number };
type NewRoom = { kind: Kind; room_number: string; rent?: number; advance?: number };
type EditValues = { kind: Kind; room_number: string; rent: number; advance: number };
type ReturnValues = {
  mode: "applied" | "refund";
  paid_from: "advance" | "cash";
  amount: number;
  return_date: Dayjs;
  month: Dayjs;
  note?: string;
};
type MoveValues = {
  destination: "cash" | "bank";
  amount: number;
  move_date: Dayjs;
  note?: string;
};

const fmt = (v: number) => Number(v).toLocaleString();
const labelOf = (r: { kind: Kind; room_number: string }) =>
  `${r.kind === "shop" ? "Shop" : "Room"} ${r.room_number}`;
const TypeTag = ({ kind }: { kind: Kind }) => (
  <Tag color={kind === "shop" ? "purple" : "blue"} style={{ margin: 0 }}>
    {kind === "shop" ? "Shop" : "Room"}
  </Tag>
);

export default function RoomsPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [search, setSearch] = useState("");
  const [onlyAdvance, setOnlyAdvance] = useState(false);
  // Per room: advance already moved to cash/bank, less refunds that were paid out of cash.
  const [movedByRoom, setMovedByRoom] = useState<Map<string, number>>(new Map());

  const [addOpen, setAddOpen] = useState(false);
  const numberRef = useRef<InputRef>(null);
  const [form] = Form.useForm<NewRoom>();

  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editForm] = Form.useForm<EditValues>();

  const [moveRoom, setMoveRoom] = useState<Room | null>(null);
  const [moveForm] = Form.useForm<MoveValues>();

  const [returnRoom, setReturnRoom] = useState<Room | null>(null);
  const [returnForm] = Form.useForm<ReturnValues>();
  const returnMode = Form.useWatch("mode", returnForm);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [r, m, ret] = await Promise.all([
      fetchAll((lo, hi) =>
        supabase
          .from("rooms")
          .select("id, kind, room_number, rent, advance")
          .order("kind", { ascending: false })
          .order("room_number")
          .order("id")
          .range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase.from("advance_moves").select("room_id, amount").order("id").range(lo, hi),
      ),
      fetchAll((lo, hi) =>
        supabase
          .from("advance_returns")
          .select("room_id, amount")
          .eq("kind", "refund")
          .eq("paid_from", "cash")
          .order("id")
          .range(lo, hi),
      ),
    ]);
    const err = r.error ?? m.error ?? ret.error;
    if (err) message.error(err.message);
    setRooms(r.data ?? []);
    const moved = new Map<string, number>();
    (m.data ?? []).forEach((x) => {
      if (x.room_id) moved.set(x.room_id, (moved.get(x.room_id) ?? 0) + Number(x.amount));
    });
    (ret.data ?? []).forEach((x) => {
      if (x.room_id) moved.set(x.room_id, (moved.get(x.room_id) ?? 0) - Number(x.amount));
    });
    setMovedByRoom(moved);
    setLoading(false);
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Advance held for this room that has not been moved to cash or the bank yet.
  const notMoved = (room: Room) =>
    Math.max(Number(room.advance) - (movedByRoom.get(room.id) ?? 0), 0);

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

  async function saveEdit(values: EditValues) {
    const room = editRoom!;
    setSaving(true);
    const { error } = await createClient()
      .from("rooms")
      .update({
        kind: values.kind,
        room_number: values.room_number.trim(),
        rent: values.rent ?? 0,
        advance: values.advance ?? 0,
      })
      .eq("id", room.id);
    setSaving(false);
    if (error) {
      return message.error(
        error.code === "23505"
          ? `${labelOf({ kind: values.kind, room_number: values.room_number.trim() })} already exists`
          : error.message,
      );
    }
    message.success(`${labelOf({ kind: values.kind, room_number: values.room_number.trim() })} updated`);
    setEditRoom(null);
    load();
  }

  async function moveAdvance(values: MoveValues) {
    const room = moveRoom!;
    setSaving(true);
    const { error } = await createClient()
      .from("advance_moves")
      .insert({
        room_id: room.id,
        room_label: labelOf(room),
        amount: values.amount,
        destination: values.destination,
        move_date: values.move_date.format("YYYY-MM-DD"),
        note: values.note?.trim() || null,
      });
    setSaving(false);
    if (error) return message.error(error.message);
    message.success(
      `${fmt(values.amount)} of ${labelOf(room)} advance moved to ${
        values.destination === "bank" ? "the bank" : "cash on hand"
      }`,
    );
    setMoveRoom(null);
    load();
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
      const { data: existing, error: existingError } = await supabase
        .from("payments")
        .select("amount, advance_applied")
        .eq("room_id", room.id)
        .eq("month", month);
      if (existingError) {
        setSaving(false);
        return message.error(existingError.message);
      }
      const alreadyPaid = (existing ?? []).reduce(
        (s, p) => s + Number(p.amount) + Number(p.advance_applied),
        0,
      );
      const due = Number(room.rent) - alreadyPaid;
      if (due <= 0) {
        setSaving(false);
        return message.error(`Rent for ${values.month.format("MMMM YYYY")} is already paid`);
      }
      if (values.amount > due) {
        setSaving(false);
        return message.error(`Only ${fmt(due)} is still due for ${values.month.format("MMMM YYYY")}`);
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          room_id: room.id,
          month,
          amount: 0,
          advance_applied: values.amount,
          paid_at: new Date().toISOString(),
          paid_by: auth.user?.email ?? "admin",
        })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        return message.error(error.message);
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
      paid_from: applied ? "advance" : values.paid_from,
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

  const returnInitial = returnRoom
    ? {
        mode: returnRoom.kind === "room" ? "applied" : "refund",
        paid_from: notMoved(returnRoom) >= Number(returnRoom.advance) ? "advance" : "cash",
        amount:
          returnRoom.kind === "room"
            ? Math.min(Number(returnRoom.advance), Number(returnRoom.rent))
            : undefined,
        return_date: dayjs(),
        month: dayjs(),
      }
    : undefined;

  const q = search.trim().toLowerCase();
  const visible = rooms
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => !onlyAdvance || Number(r.advance) > 0)
    .filter((r) => !q || r.room_number.toLowerCase().includes(q));
  const visibleRent = visible.reduce((sum, r) => sum + Number(r.rent), 0);
  const visibleAdvance = visible.reduce((sum, r) => sum + Number(r.advance), 0);
  const roomCount = rooms.filter((r) => r.kind === "room").length;
  const shopCount = rooms.length - roomCount;
  const totalAdvance = rooms.reduce((sum, r) => sum + Number(r.advance), 0);

  // The advance menu only exists for rooms and shops that hold an advance.
  const advanceMenu = (r: Room) => ({
    items: [
      { key: "move", label: "Move to cash or bank", disabled: notMoved(r) <= 0 },
      { key: "return", label: r.kind === "room" ? "Use for rent / give back" : "Give back" },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "move") setMoveRoom(r);
      else setReturnRoom(r);
    },
  });

  return (
    <>
      <PageHeader
        title="Rooms & Shops"
        subtitle={`${roomCount} rooms, ${shopCount} shops - advance held ${fmt(totalAdvance)}`}
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
        <Checkbox checked={onlyAdvance} onChange={(e) => setOnlyAdvance(e.target.checked)}>
          Only with advance
        </Checkbox>
        <span style={{ color: "#64748b" }}>
          Showing {visible.length} of {rooms.length}
        </span>
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
      ) : isMobile ? (
        <div className="unit-list">
          {visible.map((r) => (
            <div key={r.id} className="unit-card plain">
              <div>
                <div className="unit-title">
                  <TypeTag kind={r.kind} />
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
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    { key: "edit", label: "Edit" },
                    ...(Number(r.advance) > 0
                      ? [
                          { key: "move", label: "Move advance to cash or bank", disabled: notMoved(r) <= 0 },
                          { key: "return", label: r.kind === "room" ? "Use advance for rent / give back" : "Give advance back" },
                        ]
                      : []),
                    { key: "delete", label: "Delete", danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === "edit") setEditRoom(r);
                    else if (key === "move") setMoveRoom(r);
                    else if (key === "return") setReturnRoom(r);
                    else
                      Modal.confirm({
                        title: `Delete ${labelOf(r)}?`,
                        okText: "Delete",
                        okButtonProps: { danger: true },
                        onOk: () => removeRoom(r),
                      });
                  },
                }}
              >
                <Button type="text" icon={<MoreOutlined />} aria-label="Actions" />
              </Dropdown>
            </div>
          ))}
        </div>
      ) : (
        <Card className="soft-card" styles={{ body: { padding: 0 } }}>
          <Table<Room>
            rowKey="id"
            dataSource={visible}
            size="middle"
            sticky
            pagination={false}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <b>Total ({visible.length})</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <b>{fmt(visibleRent)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <b>{fmt(visibleAdvance)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
            columns={[
              {
                title: "Type",
                dataIndex: "kind",
                width: 110,
                sorter: (a, b) => a.kind.localeCompare(b.kind),
                render: (k: Kind) => <TypeTag kind={k} />,
              },
              {
                title: "Name",
                dataIndex: "room_number",
                width: 260,
                sorter: (a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
                render: (v: string) => <b style={{ whiteSpace: "nowrap" }}>{v}</b>,
              },
              {
                title: "Rent",
                dataIndex: "rent",
                align: "right",
                sorter: (a, b) => Number(a.rent) - Number(b.rent),
                render: (v: number) => fmt(v),
              },
              {
                title: "Advance",
                dataIndex: "advance",
                align: "right",
                sorter: (a, b) => Number(a.advance) - Number(b.advance),
                render: (v: number, r) => (
                  <div>
                    {Number(v) > 0 ? <b>{fmt(v)}</b> : <span style={{ color: "#94a3b8" }}>-</span>}
                    {Number(v) > 0 && notMoved(r) < Number(v) && (
                      <div style={{ fontSize: 14, color: "#64748b" }}>
                        {fmt(notMoved(r))} not moved
                      </div>
                    )}
                  </div>
                ),
              },
              {
                title: "",
                align: "right",
                width: 190,
                render: (_, r) => (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    {Number(r.advance) > 0 && (
                      <Dropdown menu={advanceMenu(r)} trigger={["click"]}>
                        <Button size="small">
                          Advance <DownOutlined />
                        </Button>
                      </Dropdown>
                    )}
                    <Tooltip title="Edit">
                      <Button type="text" icon={<EditOutlined />} onClick={() => setEditRoom(r)} />
                    </Tooltip>
                    <Popconfirm title={`Delete ${labelOf(r)}?`} onConfirm={() => removeRoom(r)}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </span>
                ),
              },
            ]}
          />
        </Card>
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
          preserve={false}
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
        destroyOnHidden
      >
        <Form
          key={editRoom?.id}
          form={editForm}
          preserve={false}
          layout="vertical"
          onFinish={saveEdit}
          initialValues={
            editRoom
              ? {
                  kind: editRoom.kind,
                  room_number: editRoom.room_number,
                  rent: Number(editRoom.rent),
                  advance: Number(editRoom.advance),
                }
              : undefined
          }
          autoComplete="off"
        >
          <Form.Item name="kind" label="Type">
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
            label="Name / number"
            rules={[{ required: true, whitespace: true, message: "Enter the room or shop name" }]}
          >
            <Input size="large" />
          </Form.Item>
          <Form.Item name="rent" label="Monthly rent">
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="advance" label="Advance held">
            <InputNumber size="large" min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={moveRoom ? `Move advance - ${labelOf(moveRoom)}` : ""}
        open={!!moveRoom}
        onCancel={() => setMoveRoom(null)}
        onOk={() => moveForm.submit()}
        okText="Move"
        confirmLoading={saving}
        centered
        destroyOnHidden
      >
        <p>
          Advance held: <b>{fmt(moveRoom?.advance ?? 0)}</b> - not moved yet:{" "}
          <b>{moveRoom ? fmt(notMoved(moveRoom)) : 0}</b>. Moved money is added to cash on hand or
          the bank, so you can spend it. The tenant may still be owed it back.
        </p>
        <Form
          key={moveRoom?.id}
          form={moveForm}
          preserve={false}
          layout="vertical"
          onFinish={moveAdvance}
          initialValues={{
            destination: "cash",
            move_date: dayjs(),
            amount: moveRoom ? notMoved(moveRoom) : undefined,
          }}
          autoComplete="off"
        >
          <Form.Item name="destination" label="Move to">
            <Segmented
              block
              options={[
                { label: "Cash on hand", value: "cash" },
                { label: "Bank", value: "bank" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount"
            rules={[
              { required: true, message: "Enter amount" },
              {
                validator: (_, v: number | undefined) =>
                  moveRoom && v != null && v > notMoved(moveRoom)
                    ? Promise.reject(new Error(`Only ${fmt(notMoved(moveRoom))} is available to move`))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber size="large" min={1} style={{ width: "100%" }} autoFocus />
          </Form.Item>
          <Form.Item name="move_date" label="Date" rules={[{ required: true }]}>
            <DatePicker allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={returnRoom ? `Advance - ${labelOf(returnRoom)}` : ""}
        open={!!returnRoom}
        onCancel={() => setReturnRoom(null)}
        onOk={() => returnForm.submit()}
        okText={returnMode === "applied" ? "Deduct from rent" : "Return advance"}
        confirmLoading={saving}
        centered
        destroyOnHidden
      >
        <p>
          Advance held: <b>{fmt(returnRoom?.advance ?? 0)}</b> - Rent:{" "}
          <b>{fmt(returnRoom?.rent ?? 0)}</b>
        </p>
        <Form
          key={returnRoom?.id}
          form={returnForm}
          preserve={false}
          layout="vertical"
          onFinish={returnAdvance}
          initialValues={returnInitial}
          autoComplete="off"
        >
          <Form.Item name="mode">
            <Segmented
              block
              onChange={onModeChange}
              options={[
                { label: "Deduct from rent", value: "applied" },
                { label: "Give back", value: "refund" },
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
          {returnMode === "refund" && (
            <Form.Item
              name="paid_from"
              label="Paid from"
              extra="Use cash on hand if you already moved this advance into cash or the bank."
            >
              <Segmented
                block
                options={[
                  { label: "Advance not moved", value: "advance" },
                  { label: "Cash on hand", value: "cash" },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item
            name="amount"
            label={returnMode === "applied" ? "Amount deducted" : "Amount returned"}
            extra={
              returnMode === "applied"
                ? "If this is less than the rent due, the rest stays due on the Rent page."
                : "Security money handed back to the tenant."
            }
            rules={[
              { required: true, message: "Enter amount" },
              {
                validator: (_, v: number | undefined) => {
                  if (v == null || !returnRoom) return Promise.resolve();
                  if (v > Number(returnRoom.advance))
                    return Promise.reject(new Error("More than the advance held"));
                  if (
                    returnMode === "refund" &&
                    returnForm.getFieldValue("paid_from") === "advance" &&
                    v > notMoved(returnRoom)
                  )
                    return Promise.reject(
                      new Error(
                        `Only ${fmt(notMoved(returnRoom))} of this advance is not moved yet. Choose "Cash on hand".`,
                      ),
                    );
                  if (returnMode === "applied" && v > Number(returnRoom.rent))
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
