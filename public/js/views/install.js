// iPhone'da Safari sekmesinde açıldığında: Ana Ekrana Ekle rehberi.
import { SHARE_ICON, ADD_ICON, iosTooOld } from '../install.js';
import { renderFigure } from '../figure.js';
import { store } from '../store.js';

export function installView(root) {
  const demo = store.byId.get('boyun-yana-egme');
  root.classList.add('no-tabbar');
  root.innerHTML = `
    <div class="ob-hero">
      ${demo ? renderFigure(demo) : ''}
      <h1>Prenses Molası 👑</h1>
      <p class="muted">Masa başında sana iyi gelecek minik esneme molaları.</p>
    </div>

    ${iosTooOld() ? `<div class="notice">Bildirimler için iOS 16.4 veya daha yeni bir sürüm gerekiyor. Ayarlar → Genel → Yazılım Güncelleme'den telefonunu güncelleyebilirsin.</div>` : ''}

    <section class="card stack">
      <h2>Önce ana ekrana ekleyelim</h2>
      <p class="small muted">iPhone yalnızca ana ekrana eklenmiş uygulamaların bildirim göndermesine izin veriyor. Bir kerelik, 10 saniyelik iş:</p>
      <ol class="install-steps">
        <li><span>Safari'nin alt çubuğundaki <b>Paylaş</b> ${SHARE_ICON} simgesine dokun.</span></li>
        <li><span>Listeyi aşağı kaydır ve <b>Ana Ekrana Ekle</b> ${ADD_ICON} seçeneğine dokun.</span></li>
        <li><span>Sağ üstteki <b>Ekle</b>'ye dokun.</span></li>
        <li><span>Ana ekranındaki taçlı 👑 simgeden uygulamayı aç ve bildirimlere izin ver.</span></li>
      </ol>
      <div class="pointer" aria-hidden="true">⬇️</div>
    </section>

    <a class="btn ghost block" href="#/hareketler" id="peek">Önce hareketlere göz atayım</a>
  `;
  root.querySelector('#peek').addEventListener('click', () => {
    try {
      sessionStorage.setItem('pm.peek', '1');
    } catch {
      /* yoksay */
    }
  });
}
