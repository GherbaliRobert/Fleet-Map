// Salvează pe telefon un fișier de TEXT făcut chiar aici (ex. traseul ca KML pentru Google Earth), prin
// foaia de partajare a telefonului — de unde omul îl pune în Fișiere/Drive sau îl trimite.
// Fișierele făcute de SERVER (rapoarte, CSV-ul traseului, situația flotei) NU trec pe aici: ele merg prin
// lib/export.ts (salveazaDeLaServer), cu numele dat de server.
import { Capacitor } from '@capacitor/core';

export async function salveazaText(nume: string, continut: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const cale = nume.replace(/[\\/:*?"<>|]+/g, '-');
    try {
      await Filesystem.writeFile({ path: cale, data: continut, directory: Directory.Cache, encoding: Encoding.UTF8 });
      const { uri } = await Filesystem.getUri({ path: cale, directory: Directory.Cache });
      await Share.share({ title: nume, dialogTitle: 'Salvează sau trimite', files: [uri] } as any);
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message || ''))) return; // omul a închis foaia — nu e o eroare
      throw new Error(e?.message || 'Nu am putut salva fișierul pe acest telefon.');
    }
    return;
  }
  // În browser (dezvoltare): descărcare obișnuită.
  const u = URL.createObjectURL(new Blob([continut], { type: mime }));
  const a = document.createElement('a');
  a.href = u; a.download = nume;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(u); } catch { /* */ } }, 30000);
}
