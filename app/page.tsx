import Tracker from './tracker';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <Tracker userName={user.fullName || 'My workspace'} />;
}
