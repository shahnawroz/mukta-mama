"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Drawer, Layout, Menu } from "antd";
import {
  AppstoreOutlined,
  DashboardOutlined,
  HomeOutlined,
  LogoutOutlined,
  BankOutlined,
  MenuOutlined,
  MinusCircleOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";

function NavMenu({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <Menu
      mode="inline"
      selectedKeys={[pathname]}
      onClick={onNavigate}
      style={{ border: "none", flex: 1 }}
      items={[
        { key: "/", icon: <DashboardOutlined />, label: <Link href="/">Dashboard</Link> },
        {
          key: "/rooms",
          icon: <AppstoreOutlined />,
          label: <Link href="/rooms">Rooms & Shops</Link>,
        },
        { key: "/rent", icon: <WalletOutlined />, label: <Link href="/rent">Rent</Link> },
        { key: "/income", icon: <BankOutlined />, label: <Link href="/income">Income</Link> },
        {
          key: "/expenses",
          icon: <MinusCircleOutlined />,
          label: <Link href="/expenses">Expenses</Link>,
        },
        {
          key: "/utilities",
          icon: <ThunderboltOutlined />,
          label: <Link href="/utilities">Utilities</Link>,
        },
      ]}
    />
  );
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 18 }}>
      <span
        className="stat-icon"
        style={{ width: 36, height: 36, background: "#4f46e5", color: "#fff", fontSize: 18 }}
      >
        <HomeOutlined />
      </span>
      Mukta Mama
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider
        className="desktop-sider"
        width={232}
        theme="light"
        style={{ borderRight: "1px solid #eceef6" }}
      >
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 12 }}>
          <div style={{ padding: "12px 8px 20px" }}>
            <Brand />
          </div>
          <NavMenu pathname={pathname} />
          <Button icon={<LogoutOutlined />} onClick={logout} block>
            Logout
          </Button>
        </div>
      </Layout.Sider>
      <Layout>
        <header className="mobile-bar">
          <Button type="text" icon={<MenuOutlined />} onClick={() => setOpen(true)} aria-label="Menu" />
          <Brand />
        </header>
        <Layout.Content className="content">
          <div className="page">{children}</div>
        </Layout.Content>
      </Layout>
      <Drawer
        placement="left"
        size="100%"
        open={open}
        onClose={() => setOpen(false)}
        title={<Brand />}
        styles={{ body: { display: "flex", flexDirection: "column", padding: 12 } }}
      >
        <NavMenu pathname={pathname} onNavigate={() => setOpen(false)} />
        <Button icon={<LogoutOutlined />} onClick={logout} size="large" block>
          Logout
        </Button>
      </Drawer>
    </Layout>
  );
}
