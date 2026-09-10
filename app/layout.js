import './globals.css';

export const metadata = {
  title: 'NØS Trading System OS',
  description: 'Systematic trading risk, execution and behavior monitor'
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
