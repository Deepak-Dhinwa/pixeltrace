# PixelTrace — Architecture & Learning Notes

## What this app does

Drop a photo → instantly see: **where it was taken** (map + address), **who's in it** (person count, group or solo), **what objects are detected**, and **what kind of scene** it is. No login, no storage, no accounts — just analysis.

---

## Architecture (simple)

```
Browser (React)
    │
    │ POST /api/analyze  (multipart image)
    ▼
Next.js API Route
    │
    │ forward image to ML service
    ▼
FastAPI /analyze  (synchronous — waits for all results)
    │
    ├── EXIF extraction      ~5ms     (Pillow)
    ├── YOLOv8n detection   ~50-200ms (ultralytics, CPU)
    ├── CLIP scene labels   ~200-500ms (open_clip) ─────┐ run in parallel
    └── Location prediction  ~300ms                ─────┘
          ├── GPS in EXIF  → Nominatim reverse geocode (free)
          └── No GPS       → Google Vision landmark API (free tier)
    │
    └── Returns JSON to Next.js → Next.js returns to browser
```

**Total time: ~0.5–1.5 seconds** for the full analysis.

---

## File Structure

```
PixelTrace/
├── app/
│   ├── page.tsx               Entry point — renders PixelTrace component
│   ├── layout.tsx             HTML shell + font
│   ├── globals.css            Tailwind + CSS variables
│   └── api/analyze/route.ts   Forwards image to ML service, returns results
├── components/
│   ├── PixelTrace.tsx         Main page: upload area + loading + results
│   ├── ResultsView.tsx        Cards: location, people, objects, scene
│   └── MapView.tsx            Leaflet map (lazy-loaded, no SSR)
├── lib/utils.ts               cn() helper
├── ml-service/
│   ├── main.py                FastAPI app with /analyze endpoint
│   └── services/
│       ├── exif_service.py    EXIF extraction + filtering (no noise)
│       ├── entity_service.py  YOLOv8n + Google Vision API entities
│       └── location_service.py GPS→Nominatim / Vision landmark / CLIP scene
└── learn.md                   This file
```

---

## What each card shows

### Location card
- If photo has GPS EXIF: shows map pin + "City, State, Country" from OpenStreetMap
- If no GPS but recognizable landmark: Google Vision API returns "Eiffel Tower" + coordinates
- If neither: says "No location data found"

**Why two sources?** Most smartphone photos have GPS EXIF. Old camera photos often don't. Landmark detection covers tourist/travel photos where you'd most want location anyway.

### People card
- Counts person detections from YOLOv8
- Gives a human-readable insight: "Solo", "A pair", "Small group (3)", "Crowd (7+)"
- Confidence score per detection

### Objects card
- Everything YOLOv8 detected that isn't a person: backpacks, phones, food, vehicles, animals...
- Deduplicated (same label detected multiple times → keep highest confidence)
- Color-coded by type: objects (amber), animals (green), vehicles (blue)

### Scene card
- CLIP zero-shot classification against 16 scene types
- "beach ocean", "urban city skyline", "indoor room", etc.
- Top 3 shown, first one highlighted (most likely)

---

## Technology Decisions

### Why no database or login?
You just want to analyze photos and see results — not build a photo library. Adding auth and persistence created friction and noise. The analysis is the value.

### Why YOLOv8n (nano)?
It's the smallest and fastest YOLO variant (~6MB model file, ~50ms CPU inference). Detects 80 COCO object classes — covers everything common. Upgrade to `yolov8s` if you want better accuracy at ~2× the speed cost.

### Why CLIP for scene classification?
CLIP is a vision-language model. Instead of training a classifier on scene categories, we just describe scenes in English and ask CLIP which description the image looks most like. Zero training required, and you can add or change categories just by editing the list in `location_service.py`.

### Why Nominatim (not Google Maps)?
Free, unlimited (1 req/sec for personal use), no API key needed. Returns full address hierarchy. Google Maps API costs money for geocoding.

### Why synchronous (not async + polling)?
The old version used fire-and-forget + polling. That's necessary when you need to persist results to a database. Since we're not storing anything, a direct synchronous request is simpler — upload, wait 1 second, see results.

---

## EXIF fields we keep (and why)

| Field | Why it matters |
|-------|----------------|
| Make / Model | Which camera or phone took this |
| DateTimeOriginal | Exact time the shutter fired (not file creation time) |
| ExposureTime | Shutter speed — tells you if it was dark or fast action |
| FNumber | Aperture — tells you depth of field |
| ISOSpeedRatings | Sensor sensitivity — high ISO = dark scene |
| FocalLength | How zoomed in the shot was |
| Flash | Whether flash fired |
| GPS fields | Used for location prediction |

We **deliberately drop**: ImageWidth, ImageHeight, ColorSpace, BitsPerSample, Compression, ResolutionUnit — these describe the file format, not the photo itself.

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.10+
- ~2GB disk space (PyTorch + model weights)

### 1. Start Next.js (frontend + API proxy)
```bash
cd D:/projects/PixelTrace
npm run dev
# Opens at http://localhost:3000
```

### 2. Start FastAPI ML service (in a second terminal)
```bash
cd D:/projects/PixelTrace/ml-service

# First time only:
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt

# Every time:
.venv\Scripts\activate
python main.py              # starts on port 8000
```

On first run, two models download automatically:
- `yolov8n.pt` — ~6MB, cached in `~/.cache/ultralytics/`
- CLIP ViT-B/32 — ~350MB, cached in `~/.cache/huggingface/`

### 3. Optional: Google Vision API
Already configured in `.env` and `ml-service/.env`. Used for landmark-based location detection on photos without GPS. Free tier: 1000 requests/month.

---

## Extending Later

**Want to remember past photos?** Add SQLite + simple file storage. No auth needed — just use a session ID stored in localStorage.

**Want better object detection?** Swap `yolov8n` → `yolov8s` or `yolov8m` in `entity_service.py`. Same API, higher accuracy.

**Want to identify specific people?** Add `face_recognition` Python library. Can cluster detected faces across photos (requires storing embeddings).

**Want semantic search?** Store CLIP image embeddings and let users search by description ("photos with dogs at the beach").

**Want to run on GPU?** Install `torch` with CUDA support. YOLOv8 and CLIP auto-detect GPU — inference drops to ~5ms.
