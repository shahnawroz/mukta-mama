"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#4f46e5",
            colorSuccess: "#16a34a",
            colorError: "#e11d48",
            borderRadius: 10,
            fontFamily:
              "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            colorBgLayout: "#f4f5fb",
          },
          components: {
            Card: { borderRadiusLG: 16 },
            Table: { headerBg: "#f8f9fd", headerColor: "#64748b" },
            Layout: { siderBg: "#ffffff", headerBg: "#ffffff" },
            Menu: { itemBorderRadius: 10, itemHeight: 44 },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
