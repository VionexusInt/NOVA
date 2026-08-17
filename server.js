import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: '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' });

app.post('/api/tts', async (req, res) => {
  const text = req.body?.text;
  if (!text) return res.status(400).send('Texto no válido.');

  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx", // Voz masculina profunda estilo asistente
      input: text.trim(),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (err) {
    console.error('❌ Error en OpenAI TTS:', err);
    res.status(500).json({ error: 'Error en audio' });
  }
});

app.listen(3000, () => console.log('🎙️ Servidor listo en http://localhost:3000'));