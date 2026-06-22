import { ChatScreen } from '../components/ChatScreen';
import { Api } from '../api/endpoints';

// RA Insight — agent analitic care citește rapoartele (tool-use) și răspunde combinând mai multe (/api/ai/reports-agent).
export function Insight() {
  return (
    <ChatScreen
      title="RA Insight"
      icon="sparkles"
      intro="Întreabă în limbaj natural — RA Insight citește rapoartele și-ți răspunde direct, combinând mai multe dacă e nevoie."
      suggestions={['Câți km a făcut flota săptămâna asta?', 'Care vehicul a consumat cel mai mult?', 'Cine a depășit viteza ieri?', 'Top șoferi după scor EcoDrive']}
      notActiveMsg="RA Insight nu este activ pe planul companiei tale (necesită modulul AI)."
      call={(m) => Api.reportsAgent(m)}
    />
  );
}
