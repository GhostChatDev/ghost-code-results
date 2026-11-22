import './styles.css';
export const metadata = { title: 'Evenstep', description: 'Shared expenses, made clear.' };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
