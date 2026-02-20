# 🚀 Rencana Kerja: Evolusi Menjadi OCLite Agent

Ini adalah daftar tugas untuk mengubah OCLite dari alat bantu menjadi asisten AI otonom, demi memenangkan pengakuan di Microsoft AI Dev Days Hackathon.

---

### ✅ Fase 1: Fondasi & Struktur (Tingkat Kesulitan: Mudah)

Tujuan fase ini adalah menyiapkan "kerangka" untuk para agent dan memastikan mereka bisa dipanggil dari VS Code.

-   [x] **Buat File Agent:**
    -   [x] Buat file `src/agents/ContextAnalyzerAgent.ts`.
    -   [x] Buat file `src/agents/CreativePromptAgent.ts`.
    -   Isi kedua file dengan kode dasar yang sudah disiapkan.

-   [x] **Daftarkan Perintah Baru:**
    -   [x] Buka `extension.ts`.
    -   [x] Tambahkan kode untuk `vscode.commands.registerCommand('oclite-vscode.analyzeAndGenerate', ...)` untuk mendaftarkan perintah baru.

-   [x] **Tampilkan Perintah di Menu Klik Kanan:**
    -   [x] Buka `package.json`.
    -   [x] Di bagian `contributes.menus`, tambahkan entri untuk `explorer/context` agar perintah "OCLite: Analyze & Generate Assets" muncul saat klik kanan file/folder.

-   [ ] **Uji Coba Awal:**
    -   [ ] Jalankan ekstensi di mode debug.
    -   [ ] Klik kanan sebuah file, jalankan perintahnya.
    -   [ ] Pastikan log "Generated Prompts: [...]" muncul di konsol debug. Ini membuktikan alur dasar sudah berjalan.

---

### 🟡 Fase 2: Integrasi Antarmuka & Alur Kerja (Tingkat Kesulitan: Menengah)

Tujuan fase ini adalah menghubungkan logika agent ke antarmuka pengguna (UI) yang sudah ada, sehingga pengguna bisa melihat hasilnya.

-   [ ] **Modifikasi `ChatProvider`:**
    -   [ ] Buka `src/panels/ChatProvider.ts`.
    -   [ ] Buat fungsi baru, misalnya `public async processAgentRequest(prompts: string[])`.

-   [ ] **Hubungkan `extension.ts` ke `ChatProvider`:**
    -   [ ] Di `extension.ts`, setelah mendapatkan `prompts` dari `CreativePromptAgent`, panggil fungsi `processAgentRequest` yang baru dibuat di `ChatProvider`.

-   [ ] **Tampilkan Hasil di Webview:**
    -   [ ] Di dalam `processAgentRequest`, panggil API generator gambar untuk setiap prompt.
    -   [ ] Kirim setiap gambar yang berhasil dibuat ke webview untuk ditampilkan.
    -   [ ] (Opsional) Ubah HTML/CSS di `main.js` dan `main.css` untuk menampilkan beberapa gambar sekaligus dengan rapi.

---

### 🔴 Fase 3: Implementasi Teknologi Hackathon (Tingkat Kesulitan: Sulit)

Ini adalah fase paling krusial untuk memenuhi kriteria juri. Fokus pada riset dan implementasi teknologi spesifik yang mereka minta.

-   [ ] **Riset & Implementasi Microsoft Agent Framework:**
    -   [ ] Pelajari dokumentasi resmi Microsoft Agent Framework.
    -   [ ] Refactor `ContextAnalyzerAgent` dan `CreativePromptAgent` untuk menggunakan struktur dan metode dari framework tersebut. Ini mungkin perubahan arsitektur yang signifikan.

-   [ ] **Integrasi dengan Azure AI Foundry:**
    -   [ ] Cari tahu cara menggunakan Azure AI Foundry untuk model generasi gambar.
    -   [ ] Ganti pemanggilan API gambar yang sekarang dengan pemanggilan melalui AI Foundry.

-   [ ] **Penyempurnaan & Orkestrasi:**
    -   [ ] Pastikan alur kerja antar-agent berjalan mulus menggunakan Agent Framework.
    -   [ ] Tambahkan penanganan error yang solid di setiap langkah (jika analisis gagal, jika prompt kosong, dll).
    -   [ ] Beri notifikasi yang jelas kepada pengguna tentang apa yang sedang dilakukan oleh para agent.

---

### ✨ Fase 4: Finalisasi & Pengemasan (Tingkat Kesulitan: Mudah)

Menyiapkan proyek untuk diserahkan ke hackathon.

-   [ ] **Buat Video Demo:**
    -   [ ] Rekam video berdurasi < 2 menit yang menunjukkan alur kerja "OCLite Agent" dari awal hingga akhir.
    -   [ ] Jelaskan masalah yang dipecahkan dan teknologi yang digunakan.

-   [ ] **Tulis Deskripsi Proyek:**
    -   [ ] Tulis "Project Pitch" yang menarik di halaman submisi, menyoroti penggunaan Agent Framework dan Azure AI Foundry.

-   [ ] **Bersihkan Repositori GitHub:**
    -   [ ] Pastikan `README.md` diperbarui dengan deskripsi "OCLite Agent".
    -   [ ] Pastikan kode bersih dan mudah dibaca.

-   [ ] **Submit Proyek!**
