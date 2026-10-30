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
            fontSize: 16,
            controlHeight: 42,
            controlHeightLG: 50,
            controlHeightSM: 34,
          },
          components: {
            Card: { borderRadiusLG: 16 },
            Table: { headerBg: "#f8f9fd", headerColor: "#334155", fontWeightStrong: 700 },
            Layout: { siderBg: "#ffffff", headerBg: "#ffffff" },
            Menu: { itemBorderRadius: 10, itemHeight: 50 },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
