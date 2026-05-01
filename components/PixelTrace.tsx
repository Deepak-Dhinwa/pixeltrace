'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, Loader2, AlertCircle } from 'lucide-react'
import { ResultsView, type AnalysisResult } from './ResultsView'

// Resize to max 1280px wide before uploading.
// YOLOv8 internally works at 640px, CLIP at 224px — full-resolution uploads are wasted bandwidth.
async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  const MAX_WIDTH = 1280
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.width <= MAX_WIDTH) {
        resolve({ blob: file, name: file.name })
        return
      }
      const ratio = MAX_WIDTH / img.width
      const canvas = document.createElement('canvas')
      canvas.width = MAX_WIDTH
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve({ blob: blob!, name: file.name }), 'image/jpeg', 0.92)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ blob: file, name: file.name }) }
    img.src = url
  })
}

// In production: call ML service directly (avoids Vercel's 10s serverless timeout).
// In local dev: proxy through Next.js (/api/analyze) so no CORS setup needed.
const ML_URL =
  process.env.NEXT_PUBLIC_ML_SERVICE_URL
    ? `${process.env.NEXT_PUBLIC_ML_SERVICE_URL}/analyze`
    : '/api/analyze'

export function PixelTrace() {
  const [preview, setPreview] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const analyze = useCallback(async (file: File) => {
    setResult(null)
    setError('')
    setLoading(true)
    setFilename(file.name)
    setStatus('Resizing image…')

    // Show preview immediately from original
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    try {
      const { blob, name } = await prepareImage(file)
      setStatus('Sending to ML service…')

      const form = new FormData()
      form.append('file', blob, name)

      setStatus('Detecting objects · Locating · Extracting metadata…')
      const res = await fetch(ML_URL, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Analysis failed')
      setResult(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      // Friendly message when ML service is cold-starting on HF Spaces
      setError(msg.includes('fetch') || msg.includes('network') || msg.includes('503')
        ? 'ML service is starting up (takes ~30s on first use). Please try again in a moment.'
        : msg)
    } finally {
      setLoading(false)
      setStatus('')
    }
  }, [])

  function onFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) analyze(file)
  }

  const showUpload = !preview && !loading

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <div className="p-1.5 bg-blue-500/20 rounded-lg">
          <Camera className="w-5 h-5 text-blue-400" />
        </div>
        <span className="font-semibold text-lg tracking-tight">PixelTrace</span>
        <span className="text-slate-600 text-sm ml-1">— Drop a photo. See everything.</span>
        {(result || error) && (
          <button
            onClick={() => { setPreview(null); setResult(null); setError(''); setFilename('') }}
            className="ml-auto text-sm text-slate-500 hover:text-white transition"
          >
            ← Analyze another
          </button>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        {showUpload && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-2xl p-20 text-center cursor-pointer transition-all
              ${dragging ? 'border-blue-400 bg-blue-500/10 scale-[1.01]' : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'}
            `}
          >
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => onFiles(e.target.files)} />
            <Upload className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-xl font-medium text-slate-300">Drop a photo here</p>
            <p className="text-slate-600 mt-2">or click to browse — JPEG, PNG, WEBP, HEIC supported</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="preview" className="w-48 h-48 object-cover rounded-xl opacity-40" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              </div>
            </div>
            <p className="text-slate-400">Analyzing <span className="text-white">{filename}</span></p>
            <p className="text-slate-600 text-sm">{status}</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-4 py-16">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-red-300 text-center max-w-md">{error}</p>
            <button onClick={() => { setError(''); setPreview(null) }} className="text-sm text-slate-400 hover:text-white transition">
              Try again
            </button>
          </div>
        )}

        {result && !loading && (
          <ResultsView result={result} preview={preview!} filename={filename} />
        )}
      </main>
    </div>
  )
}
