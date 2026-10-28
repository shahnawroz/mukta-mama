"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Card, Checkbox, Form, Input, Typography } from "antd";
import { HomeOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";

type Values = { email: string; password: string; remember: boolean };

const EMAIL_KEY = "remembered_email";

export default function LoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the email back in if the user ticked "Remember me" last time.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) form.setFieldsValue({ email: saved, remember: true });
    } catch {
      // storage unavailable (private mode); nothing to restore
    }
  }, [form]);

  async function onFinish({ remember, ...credentials }: Values) {
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    try {
      if (remember) localStorage.setItem(EMAIL_KEY, credentials.email);
      else localStorage.removeItem(EMAIL_KEY);
    } catch {
      // ignore storage errors
    }
    message.success("Logged in");
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-bg">
      <Card
        className="soft-card"
        style={{ width: 400, maxWidth: "100%", boxShadow: "0 20px 50px rgba(79,70,229,.12)" }}
        styles={{ body: { padding: 32 } }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            className="stat-icon"
            style={{ margin: "0 auto 12px", background: "#eef2ff", color: "#4f46e5" }}
          >
            <HomeOutlined />
          </div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Welcome back
          </Typography.Title>
          <Typography.Text type="secondary">Sign in to manage your rent</Typography.Text>
        </div>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form
          form={form}
          name="login"
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
          initialValues={{ remember: true }}
        >
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input size="large" name="email" prefix={<MailOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password
              size="large"
              name="password"
              prefix={<LockOutlined />}
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>Remember me</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" loading={loading} block>
            Sign in
          </Button>
        </Form>
      </Card>
    </main>
  );
}
