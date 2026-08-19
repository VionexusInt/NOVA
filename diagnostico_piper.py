import requests
import sys

print("=" * 60)
print("🔍 DIAGNÓSTICO COMPLETO DEL SERVIDOR PIPER")
print("=" * 60)

# 1. Probar /ping
print("\n1. Probando /ping...")
try:
    r = requests.get('http://localhost:5000/ping', timeout=5)
    print(f"   Código: {r.status_code}")
    if r.status_code == 200:
        print(f"   ✅ Respuesta: {r.json()}")
    else:
        print(f"   ❌ Error: {r.text[:200]}")
except Exception as e:
    print(f"   ❌ No se puede conectar: {e}")

# 2. Probar /tts
print("\n2. Probando /tts...")
try:
    r = requests.post('http://localhost:5000/tts',
                     json={'text': 'Prueba de voz'},
                     timeout=15)
    print(f"   Código: {r.status_code}")
    print(f"   Tamaño: {len(r.content)} bytes")
    print(f"   Tipo: {r.headers.get('content-type', 'desconocido')}")
    
    if r.status_code == 200:
        with open('test_audio.wav', 'wb') as f:
            f.write(r.content)
        print(f"   ✅ Audio guardado: test_audio.wav")
    else:
        print(f"   ❌ Error: {r.text[:200]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# 3. Probar /voces
print("\n3. Probando /voces...")
try:
    r = requests.get('http://localhost:5000/voces', timeout=5)
    print(f"   Código: {r.status_code}")
    if r.status_code == 200:
        print(f"   ✅ Respuesta: {r.json()}")
    else:
        print(f"   ❌ Error: {r.text[:200]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n" + "=" * 60)
print("📊 RESUMEN")
print("=" * 60)
print("Si /ping da 404 pero /tts funciona:")
print("  → Tu piper_server.py está desactualizado")
print("  → Solución: descarga la última versión del repositorio")
print("\nSi todo funciona:")
print("  → Reproduce test_audio.wav para escuchar la voz")
print("=" * 60)