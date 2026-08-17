import asyncio
import os
import traceback
from flask import Flask, request, send_file
from flask_cors import CORS
import edge_tts

app = Flask(__name__)
CORS(app)

VOICE = "es-ES-AlvaroNeural"

async def text_to_speech(text, output_path):
    # Se eliminan los modificadores de pitch/rate si causaban incompatibilidad en esta versión
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(output_path)

@app.route('/tts', methods=['POST'])
def generate_tts():
    data = request.get_json() or {}
    text = data.get('text', '').strip()

    if not text:
        return {"error": "Sin texto"}, 400

    output_file = "output_jarvis.mp3"
    
    if os.path.exists(output_file):
        try:
            os.remove(output_file)
        except Exception:
            pass

    print(f"🎙️ Generando voz con Edge-TTS: '{text}'")

    try:
        asyncio.run(text_to_speech(text, output_file))
        return send_file(output_file, mimetype='audio/mpeg')
    except Exception as e:
        print("❌ ERROR DETALLADO EN PYTHON:")
        traceback.print_exc()
        return {"error": str(e)}, 500

if __name__ == '__main__':
    print("🎙️ Servidor Edge-TTS listo en http://localhost:5000")
    app.run(host='127.0.0.1', port=5000)