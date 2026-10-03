/**
 * Seed catalog.
 *
 * WHY THIS EXISTS: Spotify removed audio-features (Nov 2024) and popularity
 * (Feb 2026) for most apps, so the flow engine cannot rely on a streaming
 * service for energy/tempo data. This curated catalog carries editorial
 * metadata the engine needs.
 *
 * DATA NOTE: feature values (BPM, energy, danceability, valence, acousticness,
 * popularity) and some years/durations are EDITORIAL ESTIMATES on a 0..10
 * scale, not measurements. They are good enough for flow design, and the
 * matcher verifies every track against the target platform before export.
 * Replace / enrich with a feature API (ReccoBeats, GetSongBPM, Deezer bpm)
 * in production — see docs/ARCHITECTURE.md §3.
 *
 * Row format:
 *  [title, artist, year, "m:ss", "genre|genre", bpm, energy, dance, valence, acoustic, popularity, "tags", opts?]
 */
import type { GenreId, MusicTrack, TrackTag } from "../types";
import { GENRES } from "./genres";

type Opts = { lang?: string; explicit?: boolean; inst?: boolean; key?: string };
type Row = [string, string, number, string, string, number, number, number, number, number, number, string, Opts?];

const ROWS: Row[] = [
  // ───────────── Turkish pop & dance-pop (80s–2020s) ─────────────
  ["Şımarık", "Tarkan", 1997, "3:56", "tr-dance|tr-pop", 128, 9, 9, 9, 2, 10, "singalong anthem"],
  ["Şıkıdım", "Tarkan", 1994, "4:12", "tr-dance|tr-pop", 122, 9, 9, 9, 2, 10, "singalong anthem oyun"],
  ["Kuzu Kuzu", "Tarkan", 2001, "3:50", "tr-dance|tr-pop", 124, 8, 9, 8, 2, 9, "singalong"],
  ["Dudu", "Tarkan", 2003, "3:47", "tr-dance|tr-pop", 118, 8, 8, 8, 2, 9, "singalong"],
  ["Hepsi Senin mi?", "Tarkan", 1994, "4:20", "tr-pop", 112, 7, 7, 7, 3, 8, "singalong classic"],
  ["Salına Salına Sinsice", "Tarkan", 1997, "4:10", "tr-pop|tr-dance", 116, 7, 8, 7, 3, 7, "singalong"],
  ["Kış Güneşi", "Tarkan", 2001, "4:55", "tr-pop", 86, 4, 5, 4, 5, 7, "slow romantic"],
  ["Sevdanın Son Vuruşu", "Tarkan", 2010, "4:05", "tr-pop", 104, 6, 6, 5, 3, 7, ""],
  ["Öp", "Tarkan", 2017, "3:31", "tr-pop|tr-dance", 118, 7, 8, 8, 2, 7, "singalong"],
  ["Yolla", "Tarkan", 2019, "3:37", "tr-pop", 96, 5, 6, 5, 4, 8, "singalong"],
  ["Araba", "Mustafa Sandal", 1998, "3:58", "tr-dance|tr-pop", 126, 8, 8, 8, 2, 9, "singalong"],
  ["Aya Benzer", "Mustafa Sandal", 1998, "4:12", "tr-pop", 110, 7, 7, 7, 3, 8, "singalong"],
  ["Bu Kız Beni Görmeli", "Mustafa Sandal", 1994, "4:01", "tr-pop|tr-dance", 120, 8, 8, 8, 2, 8, "singalong"],
  ["İsyankar", "Mustafa Sandal", 2003, "3:44", "tr-dance", 128, 8, 8, 7, 1, 7, ""],
  ["Çakkıdı", "Kenan Doğulu", 1999, "4:02", "tr-dance|tr-pop", 124, 9, 9, 9, 2, 8, "singalong"],
  ["Yaparım Bilirsin", "Kenan Doğulu", 1999, "4:15", "tr-pop|tr-dance", 120, 8, 8, 8, 2, 7, "singalong"],
  ["Shake It Up Şekerim", "Kenan Doğulu", 2007, "3:10", "tr-dance|dance", 128, 9, 9, 8, 1, 6, "cheesy"],
  ["Kim Bilebilir Aşkı", "Hande Yener", 2000, "4:20", "tr-dance|tr-pop", 122, 8, 9, 7, 2, 8, "singalong"],
  ["Acele Etme", "Hande Yener", 2002, "4:01", "tr-dance", 126, 8, 8, 7, 2, 7, ""],
  ["Everyway That I Can", "Sertab Erener", 2003, "3:05", "tr-dance|dance", 128, 9, 9, 7, 2, 8, "anthem", { lang: "en" }],
  ["Zor Kadın", "Sertab Erener", 1997, "4:10", "tr-pop", 114, 7, 7, 6, 3, 6, ""],
  ["Zalim", "Levent Yüksel", 1993, "4:30", "tr-pop", 104, 6, 6, 5, 4, 7, "classic singalong"],
  ["Benimle Oynama", "Burak Kut", 1994, "4:05", "tr-pop|tr-dance", 120, 7, 8, 7, 2, 7, "singalong cheesy"],
  ["Abone", "Yonca Evcimik", 1993, "4:15", "tr-dance", 124, 8, 9, 9, 2, 7, "cheesy singalong"],
  ["Bandıra Bandıra", "Yonca Evcimik", 1991, "4:00", "tr-dance", 126, 8, 9, 9, 2, 6, "cheesy"],
  ["Yemin Ettim", "Kayahan", 1991, "4:40", "tr-pop", 96, 5, 5, 4, 5, 8, "classic singalong romantic"],
  ["Her Gece", "Mirkelam", 1996, "4:20", "tr-pop", 108, 6, 6, 5, 4, 7, "singalong"],
  ["Ben Adam Olmam", "Serdar Ortaç", 1994, "4:00", "tr-pop|tr-dance", 120, 8, 8, 7, 2, 7, "singalong cheesy"],
  ["Karabiberim", "Serdar Ortaç", 2002, "4:05", "tr-dance", 128, 9, 9, 8, 1, 8, "singalong cheesy"],
  ["Be Adam", "Gülşen", 2004, "3:50", "tr-dance", 126, 8, 9, 7, 2, 7, "singalong"],
  ["Bangır Bangır", "Gülşen", 2015, "3:42", "tr-dance", 122, 9, 9, 8, 1, 9, "singalong anthem oyun"],
  ["Afedersin", "Demet Akalın", 2006, "3:50", "tr-dance", 124, 8, 8, 6, 2, 7, "singalong"],
  ["Toz Pembe", "Demet Akalın", 2008, "3:45", "tr-dance", 126, 8, 8, 7, 1, 7, "cheesy"],
  ["Aşkı Bulamam Ben", "Murat Boz", 2007, "3:50", "tr-dance|tr-pop", 124, 8, 8, 7, 2, 7, "singalong"],
  ["Janti", "Murat Boz", 2011, "3:20", "tr-dance", 126, 8, 9, 8, 1, 7, ""],
  ["Düm Tek Tek", "Hadise", 2009, "3:00", "tr-dance|dance", 128, 9, 9, 8, 1, 7, "", { lang: "en" }],
  ["Aşkın Olayım", "Simge", 2017, "3:30", "tr-pop|tr-dance", 104, 7, 8, 7, 2, 8, "singalong"],
  ["Miş Miş", "Simge", 2016, "3:15", "tr-dance", 120, 8, 9, 8, 1, 7, ""],
  ["Çok Çok", "Edis", 2017, "3:24", "tr-dance|tr-pop", 102, 7, 8, 7, 2, 8, "singalong"],
  ["Cevapsız Çınlama", "Aleyna Tilki", 2016, "3:24", "tr-pop", 120, 7, 7, 6, 2, 8, "singalong"],
  ["Bambaşka Biri", "Ajda Pekkan", 1975, "3:30", "tr-pop", 116, 6, 7, 7, 4, 8, "classic singalong"],
  ["Yakar Geçerim", "Ajda Pekkan", 2006, "3:55", "tr-dance|tr-pop", 124, 8, 8, 7, 2, 7, "singalong"],
  ["Hazırım", "Candan Erçetin", 1995, "4:10", "tr-pop", 112, 6, 7, 6, 4, 6, "singalong"],
  ["Yalan", "Candan Erçetin", 1997, "4:25", "tr-pop", 100, 5, 6, 5, 4, 6, ""],
  ["Hadi Bakalım", "Sezen Aksu", 1991, "4:30", "tr-pop", 112, 7, 8, 8, 4, 9, "singalong classic oyun"],
  ["Firuze", "Sezen Aksu", 1982, "3:55", "tr-pop", 104, 5, 6, 6, 5, 8, "classic singalong"],
  ["Gülümse", "Sezen Aksu", 1991, "4:20", "tr-pop", 92, 4, 5, 5, 5, 8, "classic singalong slow"],
  ["Seni Yerler", "Sezen Aksu", 1995, "4:05", "tr-pop", 116, 7, 7, 7, 3, 7, "singalong"],
  ["Haram Geceler", "Nilüfer", 1991, "4:15", "tr-pop", 108, 6, 7, 6, 3, 7, "classic singalong"],
  ["Bu Mudur", "Nil Karaibrahimgil", 2004, "3:20", "tr-pop|tr-alt", 118, 6, 7, 8, 3, 6, ""],
  ["İşte Öyle Bir Şey", "Erol Evgin", 1983, "3:45", "tr-pop", 100, 5, 6, 6, 5, 6, "classic"],
  ["Dünyanın Sonuna Doğmuşum", "Zerrin Özer", 1986, "4:30", "tr-pop|fantezi", 96, 5, 5, 4, 4, 6, "classic sad"],
  ["Ben Sana Vurgunum", "Nükhet Duru", 1981, "3:50", "tr-pop|jazz", 98, 4, 5, 6, 6, 5, "classic romantic"],
  ["Gir Kanıma", "Harun Kolçak", 2003, "3:55", "tr-pop|tr-dance", 120, 7, 8, 7, 2, 6, ""],
  ["Padişah", "Sibel Can", 2003, "4:00", "tr-dance|fantezi", 124, 8, 8, 7, 2, 7, "singalong oyun"],
  ["Delikanlım", "Yıldız Tilbe", 1995, "4:10", "tr-pop|fantezi", 104, 6, 7, 6, 4, 7, "singalong"],
  ["Vaziyetler", "Sıla", 2016, "3:50", "tr-pop", 108, 6, 6, 5, 3, 7, ""],
  ["Yan Benimle", "Sıla", 2012, "4:15", "tr-pop", 96, 5, 5, 4, 4, 7, "singalong"],
  ["Öyle Kolaysa", "Mabel Matiz", 2017, "3:40", "tr-pop|tr-alt", 104, 6, 7, 5, 3, 8, "singalong"],
  ["Ateşe Düştüm", "Mert Demir", 2022, "3:20", "tr-pop", 112, 6, 7, 5, 3, 8, ""],
  ["Seni Dert Etmeler", "Madrigal", 2019, "3:55", "tr-alt|tr-pop", 94, 4, 5, 3, 6, 8, "sad singalong"],
  ["Dönersen Islık Çal", "Manuş Baba", 2017, "3:45", "tr-pop|tr-alt", 100, 5, 6, 6, 5, 8, "singalong"],
  ["Nalan", "Emir Can İğrek", 2021, "3:40", "tr-alt", 92, 4, 5, 4, 6, 7, "sad"],
  ["Belki", "Dedublüman", 2022, "3:10", "tr-alt|tr-pop", 98, 5, 6, 4, 4, 8, "singalong"],
  ["İstersen", "Buray", 2016, "3:50", "tr-pop", 96, 5, 6, 5, 4, 6, ""],
  ["Afili Yalnızlık", "Emre Aydın", 2010, "4:20", "tr-rock|tr-pop", 92, 5, 4, 3, 4, 7, "sad singalong"],
  ["Love Me Back", "Can Bonomo", 2012, "3:00", "tr-pop|indie", 120, 7, 7, 8, 4, 5, "", { lang: "en" }],
  ["Pişman Değilim", "Semicenk", 2021, "3:30", "tr-pop|tr-rap", 96, 5, 6, 4, 3, 7, ""],

  // ───────────── Turkish rock / alternative / Anatolian rock ─────────────
  ["Bir Derdim Var", "Mor ve Ötesi", 2004, "4:20", "tr-rock", 132, 7, 5, 4, 2, 8, "singalong anthem"],
  ["Cambaz", "Mor ve Ötesi", 2008, "3:05", "tr-rock", 138, 8, 5, 5, 1, 6, ""],
  ["Bu Akşam", "Duman", 2002, "4:30", "tr-rock", 120, 7, 5, 4, 3, 8, "singalong anthem"],
  ["Senden Daha Güzel", "Duman", 2005, "4:00", "tr-rock", 96, 5, 4, 4, 4, 8, "singalong romantic"],
  ["Bir Kadın Çizeceksin", "maNga", 2004, "4:10", "tr-rock", 140, 8, 5, 4, 1, 7, "singalong"],
  ["We Could Be the Same", "maNga", 2010, "3:00", "tr-rock|rock", 145, 9, 5, 5, 1, 6, "", { lang: "en" }],
  ["Paramparça", "Teoman", 2000, "4:10", "tr-rock", 100, 5, 4, 3, 4, 7, "sad singalong"],
  ["İstanbul'da Sonbahar", "Teoman", 2001, "4:40", "tr-rock", 88, 4, 4, 3, 5, 8, "singalong"],
  ["Vazgeçtim Dünyadan", "Şebnem Ferah", 1996, "4:30", "tr-rock", 126, 7, 5, 4, 2, 7, "singalong"],
  ["Sigara", "Şebnem Ferah", 1999, "4:40", "tr-rock", 100, 6, 4, 3, 3, 6, ""],
  ["Dağlar Dağlar", "Barış Manço", 1970, "4:40", "anatolian-rock|thm", 112, 6, 5, 5, 4, 8, "classic singalong"],
  ["Gülpembe", "Barış Manço", 1985, "5:05", "anatolian-rock|tr-pop", 84, 3, 3, 3, 6, 9, "classic singalong slow sad"],
  ["Dönence", "Barış Manço", 1981, "4:40", "anatolian-rock", 96, 5, 4, 5, 5, 8, "classic singalong"],
  ["Domates Biber Patlıcan", "Barış Manço", 1989, "4:00", "anatolian-rock|tr-pop", 118, 7, 7, 9, 4, 7, "classic singalong"],
  ["Tamirci Çırağı", "Cem Karaca", 1975, "4:45", "anatolian-rock", 104, 5, 4, 4, 4, 7, "classic singalong"],
  ["Islak Islak", "Cem Karaca", 1975, "4:20", "anatolian-rock", 110, 6, 5, 5, 4, 7, "classic singalong"],
  ["Resimdeki Gözyaşları", "Cem Karaca", 1972, "4:30", "anatolian-rock", 90, 5, 4, 3, 4, 7, "classic sad"],
  ["Cemalim", "Erkin Koray", 1976, "4:10", "anatolian-rock", 116, 6, 5, 5, 4, 6, "classic"],
  ["Ele Güne Karşı", "MFÖ", 1985, "3:55", "tr-pop|tr-rock", 118, 6, 6, 7, 4, 8, "classic singalong"],
  ["Bodrum Bodrum", "MFÖ", 1984, "4:20", "tr-pop|tr-rock", 124, 7, 7, 8, 4, 7, "classic singalong summer"],
  ["Diday Diday Day", "MFÖ", 1985, "3:45", "tr-pop|tr-rock", 126, 7, 7, 9, 4, 6, "classic singalong"],
  ["Bu Kalp Seni Unutur mu?", "Fikret Kızılok", 1983, "3:50", "anatolian-rock|tr-pop", 96, 4, 4, 4, 6, 6, "classic"],
  ["Hayde", "Kazım Koyuncu", 2001, "4:00", "tr-alt|thm", 112, 6, 6, 6, 5, 6, "singalong"],
  ["Kum Gibi", "Ahmet Kaya", 1996, "4:40", "tr-pop|arabesk", 92, 4, 4, 3, 5, 8, "sad singalong"],

  // ───────────── TSM / THM / Arabesk / Fantezi ─────────────
  ["Aziz İstanbul", "Münir Nurettin Selçuk", 1952, "3:40", "tsm", 80, 3, 3, 4, 8, 6, "classic slow"],
  ["Kalamış", "Münir Nurettin Selçuk", 1955, "3:30", "tsm", 88, 3, 4, 5, 8, 6, "classic"],
  ["Manastırın Bahçesinde", "Zeki Müren", 1958, "3:50", "tsm", 84, 3, 3, 4, 8, 6, "classic slow"],
  ["Elveda Meyhaneci", "Zeki Müren", 1967, "4:10", "tsm", 92, 4, 4, 4, 7, 7, "classic singalong"],
  ["Bir Muhabbet Kuşu", "Zeki Müren", 1963, "3:40", "tsm", 96, 4, 5, 6, 7, 6, "classic singalong"],
  ["Ah Bu Şarkıların Gözü Kör Olsun", "Zeki Müren", 1970, "4:00", "tsm", 88, 4, 4, 4, 7, 7, "classic singalong"],
  ["Bir İhtimal Daha Var", "Müzeyyen Senar", 1960, "4:30", "tsm", 84, 3, 3, 3, 8, 7, "classic singalong slow"],
  ["Kimseye Etmem Şikayet", "Müzeyyen Senar", 1962, "4:00", "tsm", 92, 4, 4, 4, 8, 6, "classic singalong"],
  ["Bir Bahar Akşamı", "Muazzez Ersoy", 1995, "4:10", "tsm", 96, 4, 5, 5, 6, 6, "classic singalong"],
  ["Uzun İnce Bir Yoldayım", "Aşık Veysel", 1970, "4:20", "thm", 84, 2, 2, 3, 10, 7, "classic slow"],
  ["Kara Toprak", "Aşık Veysel", 1970, "4:30", "thm", 80, 2, 2, 3, 10, 6, "classic slow"],
  ["Gönül Dağı", "Neşet Ertaş", 1978, "5:10", "thm", 88, 3, 3, 4, 9, 8, "classic singalong"],
  ["Zahidem", "Neşet Ertaş", 1980, "5:00", "thm", 110, 5, 6, 6, 9, 6, "classic oyun"],
  ["Neredesin Sen", "Neşet Ertaş", 1983, "5:30", "thm", 84, 3, 3, 3, 9, 7, "classic sad"],
  ["Mihriban", "Musa Eroğlu", 1990, "5:20", "thm", 80, 3, 2, 3, 9, 7, "classic singalong sad"],
  ["İnce İnce Bir Kar Yağar", "Selda Bağcan", 1976, "4:10", "thm|anatolian-rock", 92, 4, 4, 3, 7, 6, "classic"],
  ["Yaz Gazeteci Yaz", "Selda Bağcan", 1976, "3:50", "anatolian-rock|thm", 110, 6, 5, 4, 5, 6, "classic"],
  ["Zülüf Dökülmüş Yüze", "Belkıs Akkale", 1985, "4:40", "thm", 96, 4, 4, 4, 8, 6, "classic singalong"],
  ["Mavi Mavi", "İbrahim Tatlıses", 1986, "4:30", "thm|fantezi", 112, 6, 6, 6, 6, 7, "classic singalong oyun"],
  ["Haydi Söyle", "İbrahim Tatlıses", 1998, "4:40", "fantezi|tr-pop", 104, 5, 5, 4, 4, 8, "singalong"],
  ["Fosforlu Cevriyem", "İbrahim Tatlıses", 1992, "4:10", "fantezi|tr-dance", 126, 8, 8, 8, 3, 7, "singalong oyun"],
  ["Batsın Bu Dünya", "Orhan Gencebay", 1975, "5:10", "arabesk", 96, 5, 4, 2, 5, 8, "classic sad singalong"],
  ["Hatasız Kul Olmaz", "Orhan Gencebay", 1973, "4:50", "arabesk", 92, 4, 4, 3, 5, 8, "classic sad singalong"],
  ["Bir Teselli Ver", "Orhan Gencebay", 1971, "4:40", "arabesk", 90, 4, 4, 3, 5, 7, "classic sad"],
  ["Nilüfer", "Müslüm Gürses", 1994, "4:20", "arabesk|tr-pop", 96, 4, 4, 3, 5, 8, "sad singalong"],
  ["Hangimiz Sevmedik", "Müslüm Gürses", 1988, "4:50", "arabesk", 88, 4, 3, 2, 5, 7, "classic sad"],
  ["Huzurum Kalmadı", "Ferdi Tayfur", 1985, "5:00", "arabesk", 90, 4, 4, 2, 5, 7, "classic sad"],
  ["Acılara Tutunmak", "Bergen", 1986, "4:30", "arabesk", 92, 4, 4, 2, 5, 7, "classic sad"],
  ["Hasretinle Yandı Gönlüm", "Cengiz Kurtoğlu", 1986, "4:40", "fantezi|arabesk", 96, 5, 5, 3, 4, 7, "classic singalong sad"],
  ["Nikah Masası", "Ümit Besen", 1986, "4:20", "fantezi|arabesk", 94, 4, 4, 3, 4, 6, "classic sad"],
  ["Sarı Sarı", "Mahsun Kırmızıgül", 1996, "4:50", "fantezi|thm", 108, 6, 6, 4, 5, 6, "singalong"],

  // ───────────── Turkish rap ─────────────
  ["Suspus", "Ceza", 2004, "4:40", "tr-rap", 96, 7, 7, 4, 2, 7, "", { explicit: true }],
  ["Galiba", "Sagopa Kajmer", 2008, "4:30", "tr-rap", 90, 5, 6, 3, 3, 7, "sad"],
  ["Geceler", "Ezhel", 2017, "3:30", "tr-rap", 94, 6, 8, 5, 2, 8, "singalong", { explicit: true }],
  ["Demet Akalın", "Ben Fero", 2017, "3:00", "tr-rap", 140, 8, 8, 6, 1, 7, "", { explicit: true }],

  // ───────────── Disco / funk / soul ─────────────
  ["Dancing Queen", "ABBA", 1976, "3:51", "disco-funk|pop", 101, 7, 7, 8, 3, 10, "singalong anthem classic"],
  ["Gimme! Gimme! Gimme! (A Man After Midnight)", "ABBA", 1979, "4:52", "disco-funk|pop", 120, 8, 8, 6, 2, 8, "singalong classic"],
  ["Mamma Mia", "ABBA", 1975, "3:32", "pop|disco-funk", 137, 7, 7, 9, 3, 8, "singalong classic"],
  ["Stayin' Alive", "Bee Gees", 1977, "4:45", "disco-funk", 104, 7, 8, 8, 2, 9, "classic"],
  ["Rasputin", "Boney M.", 1978, "4:43", "disco-funk", 126, 8, 8, 8, 2, 7, "classic cheesy"],
  ["Daddy Cool", "Boney M.", 1976, "3:28", "disco-funk", 108, 7, 8, 8, 2, 7, "classic"],
  ["I Will Survive", "Gloria Gaynor", 1978, "3:18", "disco-funk", 117, 7, 7, 6, 2, 9, "singalong anthem classic"],
  ["September", "Earth, Wind & Fire", 1978, "3:35", "disco-funk", 126, 8, 8, 10, 2, 9, "singalong classic"],
  ["Le Freak", "Chic", 1978, "5:30", "disco-funk", 120, 7, 9, 8, 2, 7, "classic"],
  ["Celebration", "Kool & The Gang", 1980, "3:38", "disco-funk", 121, 8, 8, 10, 2, 8, "singalong classic wedding"],
  ["Y.M.C.A.", "Village People", 1978, "4:46", "disco-funk", 127, 8, 8, 9, 2, 8, "singalong cheesy classic wedding"],
  ["Superstition", "Stevie Wonder", 1972, "4:26", "disco-funk|rnb-hiphop", 100, 7, 8, 7, 3, 8, "classic"],
  ["Sir Duke", "Stevie Wonder", 1976, "3:54", "disco-funk", 106, 7, 8, 10, 3, 7, "classic"],
  ["Ain't No Mountain High Enough", "Marvin Gaye & Tammi Terrell", 1967, "2:31", "disco-funk|rnb-hiphop", 130, 7, 7, 9, 4, 8, "classic singalong wedding"],
  ["Respect", "Aretha Franklin", 1967, "2:27", "rnb-hiphop|disco-funk", 115, 7, 7, 8, 3, 8, "classic singalong"],
  ["Don't Stop 'Til You Get Enough", "Michael Jackson", 1979, "6:05", "disco-funk|pop", 119, 8, 9, 8, 2, 8, "classic"],
  ["Billie Jean", "Michael Jackson", 1982, "4:54", "pop|disco-funk", 117, 7, 9, 7, 2, 10, "classic singalong"],
  ["Uptown Funk", "Mark Ronson & Bruno Mars", 2014, "4:30", "disco-funk|pop", 115, 9, 9, 9, 1, 10, "singalong anthem wedding"],
  ["Get Lucky", "Daft Punk", 2013, "6:09", "disco-funk|dance", 116, 7, 9, 9, 2, 9, "summer"],

  // ───────────── Pop / dance ─────────────
  ["I Wanna Dance with Somebody (Who Loves Me)", "Whitney Houston", 1987, "4:51", "pop|dance", 119, 8, 8, 9, 2, 9, "singalong anthem wedding"],
  ["Like a Prayer", "Madonna", 1989, "5:39", "pop", 111, 7, 7, 6, 3, 8, "singalong classic"],
  ["Hung Up", "Madonna", 2005, "5:37", "dance|pop", 125, 9, 9, 7, 1, 8, ""],
  ["Take On Me", "a-ha", 1985, "3:45", "pop", 169, 8, 6, 9, 2, 9, "singalong classic"],
  ["Girls Just Want to Have Fun", "Cyndi Lauper", 1983, "3:58", "pop", 120, 8, 7, 9, 2, 8, "singalong classic"],
  ["Wake Me Up Before You Go-Go", "Wham!", 1984, "3:51", "pop", 162, 8, 7, 10, 2, 8, "singalong classic cheesy"],
  ["Everybody (Backstreet's Back)", "Backstreet Boys", 1997, "3:45", "pop|dance", 108, 8, 8, 8, 2, 8, "singalong cheesy"],
  ["I Want It That Way", "Backstreet Boys", 1999, "3:33", "pop", 99, 6, 6, 5, 3, 9, "singalong"],
  ["Wannabe", "Spice Girls", 1996, "2:53", "pop", 110, 9, 8, 9, 2, 8, "singalong cheesy"],
  ["...Baby One More Time", "Britney Spears", 1998, "3:30", "pop", 93, 7, 8, 6, 2, 9, "singalong"],
  ["Toxic", "Britney Spears", 2003, "3:19", "pop|dance", 143, 8, 8, 7, 1, 9, "singalong"],
  ["Livin' la Vida Loca", "Ricky Martin", 1999, "4:03", "latin|pop", 178, 9, 7, 9, 2, 8, "singalong"],
  ["Hips Don't Lie", "Shakira", 2006, "3:38", "latin|pop", 100, 8, 9, 8, 2, 9, "singalong"],
  ["Whenever, Wherever", "Shakira", 2001, "3:16", "latin|pop", 108, 8, 8, 8, 2, 8, "singalong"],
  ["Waka Waka (This Time for Africa)", "Shakira", 2010, "3:22", "latin|pop", 127, 9, 8, 9, 2, 8, "singalong anthem"],
  ["Aserejé (The Ketchup Song)", "Las Ketchup", 2002, "3:33", "latin|dance", 92, 8, 8, 9, 2, 7, "cheesy singalong", { lang: "es" }],
  ["Mambo No. 5 (A Little Bit of...)", "Lou Bega", 1999, "3:39", "latin|pop", 174, 8, 8, 9, 2, 8, "cheesy singalong"],
  ["One More Time", "Daft Punk", 2000, "5:20", "dance|electronic", 123, 8, 9, 8, 1, 9, "anthem"],
  ["Blue (Da Ba Dee)", "Eiffel 65", 1998, "4:44", "dance", 128, 8, 8, 7, 1, 8, "cheesy singalong"],
  ["What Is Love", "Haddaway", 1993, "4:30", "dance", 124, 8, 8, 6, 1, 8, "singalong"],
  ["Hey Ya!", "Outkast", 2003, "3:55", "rnb-hiphop|pop", 159, 9, 8, 9, 2, 9, "singalong anthem"],
  ["Crazy in Love", "Beyoncé", 2003, "3:56", "rnb-hiphop|pop", 99, 9, 8, 7, 2, 9, "singalong"],
  ["I Gotta Feeling", "The Black Eyed Peas", 2009, "4:49", "dance|pop", 128, 8, 8, 7, 1, 9, "singalong anthem wedding"],
  ["Bad Romance", "Lady Gaga", 2009, "4:54", "dance|pop", 119, 9, 7, 6, 1, 9, "singalong"],
  ["Just Dance", "Lady Gaga", 2008, "4:01", "dance|pop", 119, 8, 8, 8, 1, 8, ""],
  ["Happy", "Pharrell Williams", 2013, "3:53", "pop|disco-funk", 160, 8, 8, 10, 3, 9, "singalong wedding"],
  ["Can't Stop the Feeling!", "Justin Timberlake", 2016, "3:56", "pop|disco-funk", 113, 8, 8, 9, 2, 9, "singalong wedding"],
  ["Wake Me Up", "Avicii", 2013, "4:07", "dance|electronic", 124, 8, 6, 6, 3, 9, "singalong anthem"],
  ["Levels", "Avicii", 2011, "3:20", "dance|electronic", 126, 9, 7, 7, 1, 8, "anthem"],
  ["Summer", "Calvin Harris", 2014, "3:43", "dance", 128, 8, 7, 7, 1, 8, "summer"],
  ["Levitating", "Dua Lipa", 2020, "3:23", "pop|disco-funk", 103, 8, 8, 9, 2, 9, "singalong"],
  ["Don't Start Now", "Dua Lipa", 2019, "3:03", "pop|disco-funk", 124, 8, 8, 7, 1, 9, "singalong"],
  ["Blinding Lights", "The Weeknd", 2019, "3:20", "pop|electronic", 171, 8, 6, 6, 1, 10, "singalong anthem"],
  ["As It Was", "Harry Styles", 2022, "2:47", "pop|indie", 174, 7, 6, 7, 3, 9, "singalong"],
  ["Umbrella", "Rihanna", 2007, "4:35", "pop|rnb-hiphop", 87, 7, 7, 6, 2, 9, "singalong"],
  ["We Found Love", "Rihanna", 2011, "3:35", "dance|pop", 128, 8, 7, 6, 1, 9, "singalong anthem"],
  ["Can't Get You Out of My Head", "Kylie Minogue", 2001, "3:50", "dance|pop", 126, 7, 8, 6, 1, 8, "singalong"],
  ["Shape of You", "Ed Sheeran", 2017, "3:53", "pop", 96, 7, 8, 9, 3, 10, "singalong"],
  ["Perfect", "Ed Sheeran", 2017, "4:23", "pop", 95, 4, 5, 3, 6, 9, "romantic slow wedding singalong"],
  ["Titanium", "David Guetta & Sia", 2011, "4:05", "dance|electronic", 126, 8, 6, 3, 1, 8, "anthem singalong"],
  ["Don't You Worry Child", "Swedish House Mafia", 2012, "3:32", "dance|electronic", 129, 8, 6, 4, 1, 8, "anthem singalong"],
  ["Lady (Hear Me Tonight)", "Modjo", 2000, "5:07", "dance|disco-funk", 126, 8, 9, 8, 1, 7, "summer"],
  ["Music Sounds Better with You", "Stardust", 1998, "4:20", "dance|disco-funk", 124, 8, 9, 8, 1, 7, ""],
  ["Praise You", "Fatboy Slim", 1998, "5:23", "dance|electronic", 111, 7, 8, 7, 2, 7, ""],
  ["Firestone", "Kygo", 2014, "4:32", "electronic|dance", 113, 6, 7, 4, 3, 7, "summer"],
  ["Sugar", "Robin Schulz", 2015, "3:39", "dance|electronic", 123, 7, 8, 6, 2, 7, "summer"],
  ["Despacito", "Luis Fonsi & Daddy Yankee", 2017, "3:48", "latin", 89, 8, 7, 8, 2, 10, "singalong summer", { lang: "es" }],
  ["Mi Gente", "J Balvin & Willy William", 2017, "3:06", "latin|dance", 105, 7, 8, 5, 1, 8, "", { lang: "es" }],
  ["Bamboléo", "Gipsy Kings", 1987, "3:23", "latin", 104, 8, 7, 9, 6, 7, "singalong classic summer", { lang: "es" }],
  ["Smooth", "Santana & Rob Thomas", 1999, "4:56", "latin|rock", 116, 8, 7, 8, 3, 8, "singalong"],
  ["Three Little Birds", "Bob Marley & The Wailers", 1977, "3:00", "pop", 74, 5, 7, 9, 6, 9, "classic summer singalong"],
  ["One Dance", "Drake", 2016, "2:54", "rnb-hiphop", 104, 6, 8, 4, 2, 9, ""],

  // ───────────── Rock / indie ─────────────
  ["Don't Stop Me Now", "Queen", 1978, "3:29", "rock", 156, 9, 6, 9, 2, 10, "singalong anthem classic"],
  ["Bohemian Rhapsody", "Queen", 1975, "5:55", "rock", 72, 6, 4, 4, 4, 10, "singalong anthem classic"],
  ["Another One Bites the Dust", "Queen", 1980, "3:35", "rock|disco-funk", 110, 7, 9, 7, 2, 8, "classic"],
  ["Livin' on a Prayer", "Bon Jovi", 1986, "4:09", "rock", 123, 9, 6, 7, 1, 9, "singalong anthem classic"],
  ["Don't Stop Believin'", "Journey", 1981, "4:10", "rock", 119, 8, 5, 7, 2, 9, "singalong anthem classic"],
  ["Africa", "Toto", 1982, "4:55", "rock|pop", 93, 6, 7, 7, 3, 9, "singalong classic"],
  ["Eye of the Tiger", "Survivor", 1982, "4:04", "rock", 109, 8, 6, 6, 1, 8, "anthem classic"],
  ["Sweet Child O' Mine", "Guns N' Roses", 1987, "5:56", "rock", 125, 9, 5, 6, 1, 9, "singalong classic"],
  ["Highway to Hell", "AC/DC", 1979, "3:28", "rock", 116, 9, 5, 6, 1, 8, "anthem classic"],
  ["Thunderstruck", "AC/DC", 1990, "4:52", "rock", 134, 9, 5, 6, 1, 8, "anthem"],
  ["Smells Like Teen Spirit", "Nirvana", 1991, "5:01", "rock|indie", 117, 9, 5, 4, 1, 9, "anthem"],
  ["(I Can't Get No) Satisfaction", "The Rolling Stones", 1965, "3:44", "rock", 136, 8, 6, 7, 2, 8, "classic"],
  ["Here Comes the Sun", "The Beatles", 1969, "3:05", "rock|pop", 129, 5, 5, 8, 7, 9, "classic singalong"],
  ["Twist and Shout", "The Beatles", 1963, "2:33", "rock", 126, 8, 7, 9, 3, 8, "classic singalong wedding"],
  ["Dreams", "Fleetwood Mac", 1977, "4:14", "rock|pop", 120, 5, 7, 6, 3, 9, "classic"],
  ["Go Your Own Way", "Fleetwood Mac", 1977, "3:38", "rock", 135, 8, 5, 7, 2, 8, "classic singalong"],
  ["Hotel California", "Eagles", 1976, "6:30", "rock", 74, 5, 5, 4, 4, 9, "classic singalong"],
  ["Sultans of Swing", "Dire Straits", 1978, "5:48", "rock", 148, 7, 6, 8, 3, 8, "classic"],
  ["Just Like Heaven", "The Cure", 1987, "3:32", "indie|rock", 150, 7, 5, 7, 2, 8, "classic"],
  ["Enjoy the Silence", "Depeche Mode", 1990, "4:21", "electronic|indie", 113, 6, 6, 4, 2, 8, "classic"],
  ["Wonderwall", "Oasis", 1995, "4:18", "rock|indie", 87, 6, 4, 4, 4, 9, "singalong anthem"],
  ["Don't Look Back in Anger", "Oasis", 1996, "4:48", "rock|indie", 83, 7, 4, 5, 3, 9, "singalong anthem"],
  ["Mr. Brightside", "The Killers", 2004, "3:42", "indie|rock", 148, 9, 4, 5, 1, 10, "singalong anthem"],
  ["Do I Wanna Know?", "Arctic Monkeys", 2013, "4:32", "indie|rock", 85, 5, 5, 4, 2, 9, ""],
  ["I Bet You Look Good on the Dancefloor", "Arctic Monkeys", 2005, "2:53", "indie|rock", 103, 9, 5, 7, 1, 8, ""],
  ["Californication", "Red Hot Chili Peppers", 1999, "5:29", "rock", 96, 6, 6, 3, 2, 9, "singalong"],
  ["Can't Stop", "Red Hot Chili Peppers", 2002, "4:29", "rock", 91, 9, 6, 8, 1, 8, ""],
  ["Viva la Vida", "Coldplay", 2008, "4:01", "rock|pop", 138, 6, 5, 4, 3, 9, "singalong anthem"],
  ["Yellow", "Coldplay", 2000, "4:29", "rock|indie", 87, 6, 4, 3, 3, 9, "singalong"],
  ["A Sky Full of Stars", "Coldplay", 2014, "4:28", "pop|electronic", 125, 7, 6, 2, 1, 9, "singalong"],
  ["The Less I Know the Better", "Tame Impala", 2015, "3:36", "indie|disco-funk", 117, 7, 8, 8, 2, 9, ""],
  ["Pumped Up Kicks", "Foster the People", 2010, "3:59", "indie|pop", 128, 7, 7, 9, 2, 8, ""],
  ["Electric Feel", "MGMT", 2007, "3:49", "indie|electronic", 103, 7, 8, 6, 2, 8, ""],
  ["Heat Waves", "Glass Animals", 2020, "3:58", "indie|pop", 81, 5, 7, 5, 4, 9, ""],
  ["Take Me to Church", "Hozier", 2013, "4:01", "indie|rock", 129, 6, 5, 4, 5, 9, "singalong"],
  ["Beggin'", "Måneskin", 2017, "3:31", "rock", 134, 8, 7, 6, 2, 8, "singalong"],
  ["Rolling in the Deep", "Adele", 2010, "3:48", "pop", 105, 7, 7, 5, 2, 9, "singalong anthem"],
  ["Someone Like You", "Adele", 2011, "4:45", "pop", 67, 3, 4, 2, 9, 9, "sad slow singalong"],
  ["Video Games", "Lana Del Rey", 2011, "4:42", "indie|pop", 120, 3, 3, 2, 6, 8, "sad slow"],
  ["Rehab", "Amy Winehouse", 2006, "3:35", "rnb-hiphop|pop", 144, 7, 6, 8, 3, 8, "singalong"],
  ["Back to Black", "Amy Winehouse", 2006, "4:01", "rnb-hiphop|jazz", 123, 5, 5, 3, 4, 8, "sad"],

  // ───────────── Hip-hop ─────────────
  ["Still D.R.E.", "Dr. Dre & Snoop Dogg", 1999, "4:30", "rnb-hiphop", 93, 7, 8, 6, 2, 9, "", { explicit: true }],
  ["Lose Yourself", "Eminem", 2002, "5:26", "rnb-hiphop", 171, 8, 7, 4, 1, 9, "anthem", { explicit: true }],
  ["In da Club", "50 Cent", 2003, "3:13", "rnb-hiphop", 90, 7, 9, 7, 2, 9, "", { explicit: true }],
  ["HUMBLE.", "Kendrick Lamar", 2017, "2:57", "rnb-hiphop", 150, 7, 9, 4, 1, 9, "", { explicit: true }],

  // ───────────── Jazz / lounge / chill electronic ─────────────
  ["Fly Me to the Moon", "Frank Sinatra", 1964, "2:27", "jazz", 120, 5, 6, 7, 7, 9, "classic romantic"],
  ["The Way You Look Tonight", "Frank Sinatra", 1964, "3:22", "jazz", 132, 5, 6, 7, 7, 8, "classic romantic wedding"],
  ["What a Wonderful World", "Louis Armstrong", 1967, "2:21", "jazz", 76, 2, 3, 6, 9, 9, "classic slow romantic"],
  ["Take Five", "The Dave Brubeck Quartet", 1959, "5:24", "jazz", 172, 4, 5, 6, 9, 8, "classic instrumental", { inst: true }],
  ["So What", "Miles Davis", 1959, "9:22", "jazz", 136, 3, 4, 4, 9, 8, "classic instrumental", { inst: true }],
  ["My Funny Valentine", "Chet Baker", 1954, "2:20", "jazz|lounge", 62, 1, 2, 3, 10, 7, "classic slow romantic"],
  ["Don't Know Why", "Norah Jones", 2002, "3:06", "jazz|lounge", 88, 2, 5, 5, 9, 8, "slow romantic"],
  ["Teardrop", "Massive Attack", 1998, "5:29", "electronic|lounge", 77, 4, 6, 3, 4, 8, ""],
  ["Porcelain", "Moby", 1999, "4:01", "electronic|lounge", 96, 4, 5, 3, 4, 7, ""],
  ["Eple", "Röyksopp", 2001, "3:46", "electronic|lounge", 104, 5, 7, 6, 3, 6, "instrumental", { inst: true }],
  ["La Femme d'Argent", "Air", 1998, "7:09", "lounge|electronic", 98, 4, 6, 5, 4, 6, "instrumental", { inst: true }],
  ["In the Waiting Line", "Zero 7", 2001, "4:32", "lounge|electronic", 84, 3, 5, 4, 5, 6, ""],
  ["Kerala", "Bonobo", 2017, "4:51", "electronic|lounge", 120, 6, 7, 5, 3, 7, "instrumental", { inst: true }],
];

function parseDuration(mmss: string): number {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
}

export function slugify(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function rowToTrack(r: Row): MusicTrack {
  const [title, artist, year, dur, genreStr, bpm, e, d, v, a, p, tagStr, opts = {}] = r;
  const genres = genreStr.split("|") as GenreId[];
  const tags = tagStr.split(/\s+/).filter(Boolean) as TrackTag[];
  const explicit = !!opts.explicit;
  if (explicit) tags.push("explicit");
  if (opts.inst && !tags.includes("instrumental")) tags.push("instrumental");
  const language = opts.lang ?? GENRES[genres[0]].defaultLanguage;
  return {
    id: `cat:${slugify(artist)}--${slugify(title)}`,
    title,
    artist,
    year,
    durationSec: parseDuration(dur),
    language,
    genres,
    tags,
    explicit,
    source: "catalog",
    features: {
      bpm,
      key: opts.key,
      energy: e / 10,
      danceability: d / 10,
      valence: v / 10,
      acousticness: a / 10,
      instrumentalness: opts.inst ? 0.9 : 0.05,
      popularity: p / 10,
    },
  };
}

export const SEED_TRACKS: MusicTrack[] = ROWS.map(rowToTrack);
