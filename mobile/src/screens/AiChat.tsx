import { ChatScreen } from '../components/ChatScreen';
import { Api } from '../api/endpoints';

// Asistent AI — chat general pe datele live (/api/ai/chat).
// Întrebările de aici se scad din ACELAȘI fond ca RA Insight: ChatScreen arată contorul și starea
// „fără loc pe cont". Când fondul s-a terminat, serverul răspunde cu explicația (fără niciun cost în plus).
export function AiChat() {
  return (
    <ChatScreen
      title="Asistent AI"
      icon="robot"
      intro="Întreabă-mă despre flota ta — locații, km, opriri, status. Răspund pe baza datelor live."
      suggestions={['Unde sunt vehiculele?', 'Câți km s-au făcut azi?', 'Ce vehicule sunt oprite?', 'Care e cel mai rapid acum?']}
      notActiveMsg="Asistentul AI nu e pornit pentru firma ta. Contactați administratorul platformei."
      call={(m, h) => Api.aiChat(m, h)}
    />
  );
}
