import "./globals.css";

export const metadata = {
  title: "JOI Script Studio",
  description: "พิมพ์ไอเดียภาษาใดก็ได้ แปลงเป็นบทภาษาอังกฤษตามแนวที่เลือก",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
