# Prenses Molası 👑

Masa başında uzun süre oturanlar için esneme hatırlatıcısı. iPhone'a kurulabilen bir web uygulamasıdır (PWA). Gün içinde ayarlanan aralıklarla birkaç hareketlik minik **seanslar** gönderir, ağrıyan bölgelere göre günlük bir program izler. Her hareket için animasyonlu çizim, adım adım geri sayım ve video anlatım içerir.

- **Uygulama:** Firebase Hosting'de, sade HTML/CSS/JS (build adımı yok).
- **Veri:** Firestore (`users/{uid}`), anonim giriş.
- **Bildirimler:** Standart Web Push (VAPID). Zamanlayıcı **GitHub Actions** üzerinde 10 dakikada bir çalışır. Firebase'in ücretsiz **Spark** planı yeterli, kredi kartı gerekmez.

```
iPhone (Ana Ekran uygulaması) ──abonelik──▶ Firestore users/{uid}
                                               ▲
GitHub Actions (10 dk'da bir) ── okur/yazar ───┘
        └── web-push ──▶ Apple push servisi ──▶ 🔔 bildirim ──dokun──▶ /#/seans/<hareketler>
```

---

## Kurulum (bir kerelik, yaklaşık 20 dakika)

Gerekenler: Node.js 22+, `npm i -g firebase-tools`, bir GitHub hesabı.

### 1. Firebase projesi

1. [Firebase Console](https://console.firebase.google.com) üzerinden yeni bir proje oluştur. Google Analytics gerekmiyor.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.
3. **Build → Firestore Database → Create database**: *Production mode*, konum `eur3 (europe-west)` ya da sana yakın bir bölge.
4. **Project settings (⚙️) → General → Your apps → Web (`</>`)** ile bir web uygulaması ekle. Hosting kutusunu işaretlemene gerek yok. Çıkan `firebaseConfig` değerlerini [`public/js/config.js`](public/js/config.js) dosyasına yapıştır.
5. [`.firebaserc`](.firebaserc) içindeki `FIREBASE_PROJE_ID_BURAYA` yerine proje kimliğini yaz.

> Web config değerleri gizli değildir, herkes görebilir. Güvenliği [`firestore.rules`](firestore.rules) sağlar: her kullanıcı yalnızca kendi dokümanını okuyup yazabilir.

### 2. Bildirim anahtarları (VAPID)

```bash
npx web-push generate-vapid-keys
```

- **Public Key** → [`public/js/config.js`](public/js/config.js) içindeki `VAPID_PUBLIC_KEY`.
- **Private Key** → yalnızca GitHub Secret olarak saklanır (adım 4). Repoya **asla** yazma.

### 3. Yayına al

```bash
npm install
firebase login
npm run deploy        # = firebase deploy --only hosting,firestore:rules
```

Adres `https://<proje-id>.web.app` olur.

### 4. GitHub ve zamanlayıcı

1. Firebase Console → **Project settings → Service accounts → Generate new private key**. İnen JSON dosyası tam yetkili bir anahtardır. Repoya koyma; işin bitince bilgisayarından da silebilirsin.
2. Bu klasörü GitHub'a **public** repo olarak yükle (nedeni aşağıda).
3. Repo → **Settings → Secrets and variables → Actions → New repository secret** ile şu dört secret'ı ekle:

   | Secret | Değer |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | İndirdiğin JSON dosyasının **tüm içeriği** |
   | `VAPID_PUBLIC_KEY` | Adım 2'deki public key |
   | `VAPID_PRIVATE_KEY` | Adım 2'deki private key |
   | `VAPID_SUBJECT` | `mailto:senin@adresin.com` (Apple geçerli bir `mailto:` ya da `https:` ister) |

4. Repo sayfasındaki **Actions** sekmesine gir ve solda **Esneme hatırlatmaları** ile **Testler** iş akışlarının listelendiğini kontrol et. Yeni repolarda bunlar otomatik açıktır, ek bir şey yapman gerekmez. `Esneme hatırlatmaları` artık 10 dakikada bir çalışacak.
   - Listede değil de yeşil **"I understand my workflows, go ahead and enable them"** butonu görürsen ona tıkla (genelde fork'lanmış repolarda çıkar).
   - Actions kapalı uyarısı görürsen: **Settings → Actions → General → Allow all actions and reusable workflows → Save**.
   - Zamanlanmış ilk çalışmayı beklemene gerek yok: **Esneme hatırlatmaları**'na tıklayıp sağdaki **Run workflow** butonuyla elle de tetikleyebilirsin.

**Neden public repo?** GitHub Actions public repolarda ücretsiz ve sınırsızdır. Private repoda ayda 2000 dakika var. Bu zamanlayıcı ayda yaklaşık 3200 çalışma yapar, her biri en az 1 dakika sayılır. Repoda gizli bir şey yok: anahtarlar Secrets'ta, veriler kurallarla korunan Firestore'da duruyor.

> Private repo kullanmak istersen [`reminders.yml`](.github/workflows/reminders.yml) içindeki cron'u seyrelt, ör. hafta içi 15 dakikada bir: `'5,20,35,50 5-16 * * 1-5'`. Bu ayda yaklaşık 1050 dakika eder.

Public repolarda 60 gün hiç aktivite olmazsa GitHub zamanlanmış iş akışlarını durdurur. Bunu önlemek için aynı iş akışı ayda bir kendini yeniden etkinleştiriyor (`keepalive` işi). GitHub ayrıca durdurmadan önce e-posta gönderir. Gelirse Actions sekmesinden tek tıkla yeniden açabilirsin.

### 5. iPhone'a kurulum

1. **Safari**'de `https://<proje-id>.web.app` adresini aç. iOS 16.4 veya üstü gerekli.
2. **Paylaş** (kutudan çıkan ok) → **Ana Ekrana Ekle** → **Ekle**.
3. Ana ekrandaki taçlı **Prenses 👑** simgesinden aç. Hitap, program ve ağrıyan bölgeleri seç, ardından **Bildirimlere izin ver 💌** butonuna dokun.

> iPhone, web uygulamalarına yalnızca ana ekrandan açıldıklarında bildirim izni verir. Safari sekmesinde açılırsa uygulama otomatik olarak kurulum rehberini gösterir.

### 6. Test et

1. Uygulamada **Ayarlar → Test bildirimi 🔔**: yerel bildirim gelmeli.
2. **Ayarlar** ekranının altındaki **Kullanıcı kimliği**ne dokun, kopyalanır.
3. GitHub → **Actions → Esneme hatırlatmaları → Run workflow**: `uid` alanına kimliği yapıştır, `force` kutusunu işaretle, çalıştır. Bir iki dakika içinde gerçek push bildirimi gelmeli. Bildirime dokununca seans ekranı açılmalı.
4. Sonrasında mesai saatlerinde kendiliğinden gelir. Ayrıntılar için Actions sekmesindeki çalışma loglarına bakabilirsin.

---

## Nasıl çalışır?

### Günlük program ve seanslar ([`plan.js`](public/js/shared/plan.js))

- **Günlük program:** Her gün için `seans sayısı × 3` hareketlik bir program hesaplanır. Örneğin hafta içi 09:00–18:00, saatte bir için 8 seans ve 24 hareket. Ağrıyan bölgelerin **her hareketi programa günde 2 kez** girer, kalan yer diğer bölgelerden çeşitli hareketlerle dolar. Program gün ve ayarlara göre sabittir; hem uygulama hem gönderici aynı programı hesaplar.
- **Seans:** Her bildirim birkaç farklı hareketten oluşan bir seanstır. Hareketleri sistem seçer: önce ağrı hareketleri, mümkünse farklı bölgelerden, baştan aşağı sıralı (boyun → omuz → sırt → … → göz). Bildirime dokununca seans ekranı açılır; hareketler geri sayımla art arda akar ve her biten hareket anında programa işlenir.
- **Telafi:** Her seansın yükü `kalan hareket ÷ kalan seans` hesabıyla belirlenir, en az 2, **en fazla 6** hareket. Seans atlanırsa yapılmayan hareketler kalan seanslara dağılır, yük kendiliğinden artar ve bildirimde "biraz geride kaldık" yazar. Program bitince kalan seanslar 2 hareketlik bonus olur.
- **Sıfırlama:** Program her gün sıfırlanır, yetişmeyen hareketler ertesi güne devretmez. Kurulum günü yalnızca kurulumdan sonraki seanslar planlanır, ilk gün "geride" başlanmaz.
- **İlerleme takibi:** Yapılan hareketler Firestore'da `progress: {date, done[]}` olarak tutulur. Sunucu kalan yükü buradan hesaplar, gönderdiği seansı da `lastSession` olarak kaydeder.

### Zamanlama ve diğerleri

- **Zamanlama** ([`schedule.js`](public/js/shared/schedule.js)): Seçili gün ve saatler içinde, son bildirimden (ya da kendi isteğiyle yaptığı son esnemeden) bu yana **aralık − 5 dk** geçtiyse bildirim gönderilir. Cron 10 dakikada bir çalıştığı için bildirimler birkaç dakika sapabilir.
- **Mola modu:** "1 saat sessiz" ve "Bugünlük yeter" butonları `pausedUntil` alanını ayarlar. Sessizdeyken atlanan seanslar da telafiye girer.
- Zamanlama, program ve seans mantığı **tek kaynaktan** gelir: aynı dosyaları hem uygulama (ör. "sıradaki seans 14:20 · 3 hareket") hem de gönderici script kullanır.
- Geçersiz abonelikler (uygulama silinmiş, izin kaldırılmış) gönderici tarafından otomatik temizlenir. Uygulama bir sonraki açılışta yeniden abone olur.
- Actions loglarında her gönderim şöyle görünür: `gönderildi (201) → program 9/24, kalan seans 5, yük 4 (telafi) → …`

## Kişiselleştirme

| Ne | Nerede |
|---|---|
| Varsayılan hitap, saatler, aralık | [`public/js/shared/defaults.js`](public/js/shared/defaults.js) (kullanıcı uygulamadan da değiştirebilir) |
| Seans boyutu (3), ağrı tekrarı (2), telafi üst sınırı (6) | [`public/js/shared/plan.js`](public/js/shared/plan.js): `BASE_LOAD`, `FOCUS_REPS`, `MAX_LOAD` |
| Bildirim mesajları | [`public/data/messages.json`](public/data/messages.json): `session` (normal), `catchup` (telafi), `bonus` (program bitti); değişkenler `{nick}`, `{count}`, `{list}`, `{dur}` |
| Hareketler, adımlar, videolar | [`public/data/stretches.json`](public/data/stretches.json) |
| Animasyon pozları | [`public/js/figure.js`](public/js/figure.js), `ANIMS` |
| Renkler | [`public/css/app.css`](public/css/app.css) (`:root`), karakter renkleri: [`public/css/figure.css`](public/css/figure.css) |
| İkonlar | [`scripts/gen-icons.mjs`](scripts/gen-icons.mjs), ardından `npm run icons` |

Hareket ya da mesaj ekledikten sonra `npm run check:data` ile doğrula.

**Güncelleme yayınlarken:** [`public/sw.js`](public/sw.js) içindeki `CACHE` sürümünü artır (ör. `prenses-v2` → `prenses-v3`). Böylece telefondaki eski önbellek temizlenir.

## Video kontrol listesi

Her hareketin videosu fizyoterapi ve klinik kanallarından seçildi. Hepsinin YouTube'da var olduğu ve gömülebildiği doğrulandı. Videolar İngilizce; asıl anlatım uygulamadaki Türkçe adımlar ve animasyon. Bir kez göz atıp beğenmediğini `stretches.json` içinde değiştirebilirsin.

| Hareket | Video | Kanal |
|---|---|---|
| Boyun Yana Eğme | [UUXUVFQS5u0](https://youtu.be/UUXUVFQS5u0) | AskDoctorJo |
| Çene Geri Çekme | [ekJzJTnd43s](https://youtu.be/ekJzJTnd43s) | Office Athlete |
| Boyun Döndürme | [PruXF-NE2zI](https://youtu.be/PruXF-NE2zI) | AskDoctorJo |
| Omuz Çevirme | [VikUs5HH8cc](https://youtu.be/VikUs5HH8cc) | NUH Singapore |
| Omuz Silkip Bırakma | [ja_P3YhmAlE](https://youtu.be/ja_P3YhmAlE) | AskDoctorJo |
| Göğüs Açma | [74pFx17FRRU](https://youtu.be/74pFx17FRRU) | Dr. Whitley Kelley |
| Kolu Çapraz Çekme | [veZWtNGOxhE](https://youtu.be/veZWtNGOxhE) | BSR Physical Therapy |
| Baş Üstü Kol Esnetme | [0aKYbYt6eeI](https://youtu.be/0aKYbYt6eeI) | Insync Physiotherapy |
| Oturarak Yana Esneme | [riUAQz37QHw](https://youtu.be/riUAQz37QHw) | Baptist Health |
| Oturarak Omurga Burma | [v8J2iVyjDs0](https://youtu.be/v8J2iVyjDs0) | Propel Physiotherapy |
| Oturarak Kedi-İnek | [7Tnyx5hkFwA](https://youtu.be/7Tnyx5hkFwA) | Dr. Brian Abelson |
| Bilek İç Esnetme | [i-JV2PsFzWA](https://youtu.be/i-JV2PsFzWA) | AskDoctorJo |
| Bilek Dış Esnetme | [80Y3HHMgo6w](https://youtu.be/80Y3HHMgo6w) | AskDoctorJo |
| Figür-4 Kalça Esnetme | [lI3VE8fUrXo](https://youtu.be/lI3VE8fUrXo) | Northallerton Osteopaths |
| Oturarak Arka Bacak Esnetme | [P3rK-zhrUwg](https://youtu.be/P3rK-zhrUwg) | OrthoIndy |
| Ayak Bileği Çevirme | [sYAGbGEQMGE](https://youtu.be/sYAGbGEQMGE) | Vive Health |
| Göz Molası 20-20-20 | [KRuEcCuhuMI](https://youtu.be/KRuEcCuhuMI) | Brooks Rehabilitation |

## Geliştirme

```bash
npm test               # zamanlama, seçim, mesaj ve gönderici birim testleri
npm run check:data     # stretches.json / messages.json doğrulaması
npm run serve          # Firebase Hosting emülatörü → http://localhost:5050
npm run send:dry       # gerçek veride ne gönderileceğini göster (env değişkenleri gerekli)
```

- [`dev/poses.html`](dev/poses.html): tüm animasyonları birkaç karede donmuş olarak gösterir. Repo kökünü bir statik sunucuyla açıp (ör. `npx serve .`) `/dev/poses.html` adresine git. `?only=neck-tilt,twist` ile filtreleyebilirsin.
- Firebase ayarlanmadan da uygulama çalışır. Bu durumda ayarlar yalnızca cihazda saklanır ve Ayarlar ekranı eksik yapılandırmayı gösterir.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| "Bildirimlere izin ver" butonu yok | Uygulama Safari sekmesinde açık. Ana ekrandaki simgeden aç. |
| İzin reddedildi | iPhone **Ayarlar → Bildirimler → Prenses 👑 → Bildirimlere İzin Ver** |
| Test bildirimi geliyor, gerçeği gelmiyor | Actions loglarına bak. `gönderilmedi: outside-hours/day-off/waiting` normaldir. Odak modu ya da Rahatsız Etmeyin açık olabilir. |
| Logda `403 BadJwtToken` | `VAPID_SUBJECT` geçerli bir `mailto:` olmalı. Public/private anahtarlar aynı çiftten olmalı. |
| Logda `410` / `abonelik yok` | Uygulamayı bir kez aç, abonelik otomatik yenilenir. Gerekirse Ayarlar → **Aboneliği yenile**. |
| Logda `Eksik ortam değişkeni` | GitHub Secrets adlarını kontrol et. |
| Değişiklikler telefonda görünmüyor | `sw.js` içindeki `CACHE` sürümünü artırıp tekrar deploy et, uygulamayı iki kez kapatıp aç. |

---

Bu uygulama tıbbi tavsiye yerine geçmez. Ağrı sürüyorsa bir doktora ya da fizyoterapiste danışılmalı. 💗
