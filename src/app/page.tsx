import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the careers page, which is the main entry point now.
  redirect('/careers');
}
