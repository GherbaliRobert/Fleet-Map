import { ChatScreen } from '../components/ChatScreen';
import { Api } from '../api/endpoints';

// Asistent AI — chat general pe datele live (/api/ai/chat).
export function AiChat() {
  return (
    <ChatScreen
      title="Asistent AI"
      icon="robot"
      intro="Întreabă-mă despre flota ta — locații, km, opriri, status. Răspund pe baza datelor live."
      suggestions={['Unde sunt vehiculele?', 'Câți km s-au făcut azi?', 'Ce vehicule sunt oprite?', 'Care e cel mai rapid acum?']}
      notActiveMsg="Asistentul AI nu este activ pe planul companiei tale."
      call={(m, h) => Api.aiChat(m, h)}
    />
  );
}
