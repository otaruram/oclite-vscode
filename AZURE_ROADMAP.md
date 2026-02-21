# OCLite × Azure Integration Roadmap

Daftar pengembangan lanjutan untuk mengintegrasikan OCLite lebih dalam ke ekosistem Azure, diurutkan dari termudah hingga tersulit.

---

## 🟢 MUDAH — Bisa dikerjakan dalam 1-2 hari

### 1. Azure Application Insights — Telemetry & Monitoring
- **Apa:** Tambahkan SDK Application Insights ke Azure Function (`llm.ts` backend) untuk melacak berapa kali ekstensi digunakan, berapa lama response LLM, dan error yang terjadi.
- **Manfaat:** Anda bisa melihat data usage di Azure Portal secara real-time.
- **Cara:** Install `applicationinsights` di Azure Function, tambahkan `instrumentationKey` ke environment variable.
- **Relevansi Hackathon:** Menunjukkan mindset production-ready dan observability.

---

### 2. Azure Key Vault Integration (Backend)
- **Apa:** Pindahkan API key GPT-4o dan OCLite dari environment variable Azure Function ke **Azure Key Vault** yang sesungguhnya (sekarang masih di App Settings).
- **Manfaat:** Keamanan enterprise-grade. Key dirotasi tanpa perlu redeploy.
- **Cara:** Enable Managed Identity di Azure Function → grant access ke Key Vault → gunakan `@azure/keyvault-secrets` SDK.
- **Relevansi Hackathon:** Ini adalah standar keamanan Microsoft yang sesungguhnya.

---

### 3. Azure Static Web Apps — Landing Page OCLite
- **Apa:** Deploy website marketing/dokumentasi `oclite.site` ke Azure Static Web Apps.
- **Manfaat:** Gratis untuk tier F1, CI/CD otomatis via GitHub Actions, custom domain support.
- **Cara:** `az staticwebapp create` → connect ke GitHub repo → auto-deploy on push.
- **Relevansi Hackathon:** Menunjukkan ekosistem Azure yang lengkap, bukan hanya Functions.

---

## 🟡 SEDANG — Bisa dikerjakan dalam 3-5 hari

### 4. Azure Blob Storage — Image Gallery Cloud
- **Apa:** Setiap gambar yang di-generate otomatis diupload ke Azure Blob Storage, bukan hanya disimpan lokal.
- **Manfaat:** User bisa akses riwayat gambar dari device manapun. Bisa dibagikan via public URL.
- **Cara:** Tambahkan endpoint di Azure Function untuk upload blob → ekstensi kirim gambar ke sana setelah generate.
- **Integrasi VS Code:** Tambahkan command `OCLite: View My Gallery` yang fetch daftar blob dan tampilkan di webview.

---

### 5. Azure API Management (APIM) — Rate Limiting & Quota
- **Apa:** Letakkan **Azure API Management** di depan Azure Function sebagai gateway.
- **Manfaat:** Bisa set rate limit per user (misalnya 10 request/hari untuk free tier), analytics per-consumer, dan API versioning.
- **Cara:** Create APIM instance → import Azure Function API → tambahkan policy rate-limit.
- **Relevansi Hackathon:** Ini adalah arsitektur API production-grade yang sangat dihargai juri.

---

### 6. Microsoft Entra ID — User Authentication
- **Apa:** Tambahkan login via akun Microsoft ke ekstensi.
- **Manfaat:** Setiap user punya identitas. Bisa dipakai untuk kuota, personalisasi, dan riwayat gambar per-user.
- **Cara:** Gunakan VS Code built-in `vscode.authentication.getSession('microsoft', ...)` API → kirim access token ke Azure Function untuk verifikasi.
- **Integrasi:** Azure Function validasi token via Microsoft Graph API.

---

### 7. Azure Cosmos DB — Riwayat & Personalisasi
- **Apa:** Simpan riwayat prompt, gambar yang di-generate, dan preferensi user ke Azure Cosmos DB.
- **Manfaat:** User bisa melihat riwayat, re-generate gambar lama, dan mendapat rekomendasi prompt berdasarkan history.
- **Cara:** Azure Function menulis ke Cosmos DB setiap kali ada request generate → ekstensi bisa fetch history via endpoint baru.

---

## 🔴 SULIT — Bisa dikerjakan dalam 1-2 minggu

### 8. Azure AI Foundry + Semantic Kernel — Proper Agentic System
- **Apa:** Migrasikan seluruh logika agent (`ContextAnalyzerAgent`, `CreativePromptAgent`) ke **Semantic Kernel** yang berjalan di Azure AI Foundry.
- **Manfaat:** Agent Anda menjadi stateful, bisa menggunakan tool calling, memory, dan planning yang sesungguhnya.
- **Cara:**
  1. Setup Azure AI Foundry project.
  2. Port agent logic ke Semantic Kernel (C# atau Python).
  3. Deploy sebagai Azure Container Apps.
  4. Ekstensi VS Code cukup call endpoint orchestrator.
- **Relevansi Hackathon:** Ini adalah **inti dari tema hackathon**. Implementasi ini hampir menjamin nilai tinggi dari juri.

---

### 9. Azure Container Apps — Scalable Backend
- **Apa:** Pisahkan image generation service menjadi microservice tersendiri yang berjalan di **Azure Container Apps**.
- **Manfaat:** Bisa scale-to-zero (hemat biaya), mendukung GPU instance untuk generate gambar lebih cepat.
- **Cara:** Dockerize image generation service → push ke Azure Container Registry → deploy ke Container Apps dengan autoscaling rules.

---

### 10. GitHub Copilot Extension (Chat Participant) — Native Integration
- **Apa:** Kembangkan `@oclite` menjadi **GitHub Copilot Chat Participant** yang sesungguhnya, terintegrasi penuh dengan Copilot API terbaru.
- **Manfaat:** User bisa chat dengan OCLite langsung di Copilot Chat panel, dengan context-awareness penuh terhadap kode yang sedang dibuka.
- **Cara:**
  1. Daftarkan `chatParticipant` di `package.json`.
  2. Implementasikan `vscode.chat.createChatParticipant` handler.
  3. Gunakan `request.references` untuk mendapat context file yang sedang aktif.
  4. Stream response dengan `stream.markdown()` dan `stream.button()`.
- **Relevansi Hackathon:** Integrasi langsung dengan produk Microsoft AI flagship.

---

## 📊 Rekomendasi Prioritas

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Azure Key Vault | Mudah | Security ⭐⭐⭐ |
| 4 | Azure Blob Storage | Sedang | Feature ⭐⭐⭐ |
| 6 | Microsoft Entra ID | Sedang | Architecture ⭐⭐⭐ |
| 8 | Azure AI Foundry + Semantic Kernel | Sulit | Hackathon ⭐⭐⭐⭐⭐ |
| 10 | GitHub Copilot Chat Participant | Sulit | Visibility ⭐⭐⭐⭐⭐ |

> **Untuk hackathon:** Fokus ke No. 8 (Semantic Kernel) — ini yang paling selaras dengan tema AI Dev Days.
