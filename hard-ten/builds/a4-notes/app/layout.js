import './style.css';

export const metadata = { title: 'Quillstack', description: 'A thoughtful space for your notes.' };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
