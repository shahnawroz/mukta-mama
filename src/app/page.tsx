"use client";

import { Button, Card, Space, Typography } from "antd";
import { DollarOutlined } from "@ant-design/icons";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <Card style={{ maxWidth: 480, margin: "0 auto" }}>
        <Space orientation="vertical">
          <Typography.Title level={3}>
            <DollarOutlined /> Personal Income
          </Typography.Title>
          <Typography.Paragraph>
            Next.js + Ant Design setup is working.
          </Typography.Paragraph>
          <Button type="primary">Get started</Button>
        </Space>
      </Card>
    </main>
  );
}
