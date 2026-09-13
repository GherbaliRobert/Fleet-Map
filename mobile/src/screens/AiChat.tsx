import { ChatScreen } from '../components/ChatScreen';
import { Api } from '../api/endpoints';

// Asistent AI — chat general pe datele live (/api/ai/chat).
// Întrebările de aici se scad din ACELAȘI fond ca RA Insight: ChatScreen arată contorul, caseta de acord
// pentru costul suplimentar (needsExtraConsent → retrimitere cu acceptExtra) și starea „fără loc pe cont".
export function AiChat() {
  return (
    <ChatScreen
      title="Asistent AI"
      icon="robot"
      intro="Întreabă-mă despre flota ta — locații, km, opriri, status. Răspund pe baza datelor live."
      suggestions={['Unde sunt vehiculele?', 'Câți km s-au făcut azi?', 'Ce vehicule sunt oprite?', 'Care e cel mai rapid acum?']}
      notActiveMsg="Asistentul AI nu este activ pe planul companiei tale."
      call={(m, h, acceptExtra) => Api.aiChat(m, h, acceptExtra)}
    />
  );
}
