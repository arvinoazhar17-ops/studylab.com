const path = require("path");
require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// Periksa API Key sebelum membuat koneksi AI.
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

// Middleware
app.use(express.json({ limit: "100kb" }));

// Menyediakan file frontend statis.
app.use(express.static(path.join(__dirname)));

// ========================================
// AI QUESTION GENERATOR
// ========================================

app.post("/api/generate-quiz", async (req, res) => {
  try {
    // Periksa API Key.
    if (!client) {
      return res.status(503).json({
        error: "API Key OpenAI belum dikonfigurasi."
      });
    }

    // Periksa isi permintaan.
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Data permintaan tidak valid."
      });
    }

    const {
      materi,
      jenisSoal,
      jumlahSoal,
      kesulitan
    } = req.body;

    const jumlah = Number(jumlahSoal);

    // ========================================
    // VALIDASI INPUT
    // ========================================

    if (typeof materi !== "string" || materi.trim().length < 20) {
      return res.status(400).json({
        error: "Materi minimal harus 20 karakter."
      });
    }

    if (materi.length > 15000) {
      return res.status(400).json({
        error: "Materi terlalu panjang. Maksimal 15.000 karakter."
      });
    }

    if (jenisSoal !== "pilihan-ganda") {
      return res.status(400).json({
        error: "Saat ini hanya tersedia soal pilihan ganda."
      });
    }

    if (![5, 10, 15, 20].includes(jumlah)) {
      return res.status(400).json({
        error: "Jumlah soal tidak valid."
      });
    }

    if (!["mudah", "sedang", "sulit"].includes(kesulitan)) {
      return res.status(400).json({
        error: "Tingkat kesulitan tidak valid."
      });
    }

    // ========================================
    // MEMINTA AI MEMBUAT SOAL (Chat Completions)
    // ========================================

    const promptSystem = `
Kamu adalah StudyLab AI, asisten pembuat latihan soal pendidikan untuk pelajar.
Tugasmu membuat latihan soal pilihan ganda dalam format JSON murni tanpa teks pembuka/penutup.
Struktur JSON harus berupa objek dengan key "questions" yang berisi array objek soal:
[
  {
    "question": "Pertanyaan soal di sini?",
    "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
    "answer": 0,
    "explanation": "Penjelasan jawaban benar."
  }
]
Ketentuan:
- Bahasa Indonesia.
- "answer" adalah indeks jawaban benar berupa angka 0 sampai 3.
- Tepat ${jumlah} soal.
- Tingkat kesulitan: ${kesulitan}.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: promptSystem },
        { role: "user", content: `Materi pembelajaran:\n${materi}` }
      ],
      temperature: 0.7
    });

    const responseContent = completion.choices[0].message.content;
    const result = JSON.parse(responseContent);

    // ========================================
    // VALIDASI HASIL AI
    // ========================================

    if (
      !result ||
      !Array.isArray(result.questions) ||
      result.questions.length !== jumlah
    ) {
      throw new Error("Jumlah soal yang dihasilkan tidak sesuai.");
    }

    for (const soal of result.questions) {
      if (
        typeof soal.question !== "string" ||
        !Array.isArray(soal.options) ||
        soal.options.length !== 4 ||
        !soal.options.every(
          pilihan => typeof pilihan === "string"
        ) ||
        !Number.isInteger(soal.answer) ||
        soal.answer < 0 ||
        soal.answer > 3 ||
        typeof soal.explanation !== "string"
      ) {
        throw new Error("Format soal dari AI tidak valid.");
      }
    }

    // ========================================
    // KIRIM HASIL KE FRONTEND
    // ========================================

    return res.json({
      success: true,
      questions: result.questions
    });

  } catch (error) {
    console.error("AI Generator Error:", error);

    return res.status(500).json({
      error: "Gagal membuat latihan soal. Silakan coba kembali."
    });
  }
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(
    `StudyLab AI berjalan di http://localhost:${PORT}`
  );
});
