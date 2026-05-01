import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/tiff']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000'

  // Forward image directly to ML service
  const upstream = new FormData()
  upstream.append('file', file)

  try {
    const res = await fetch(`${mlUrl}/analyze`, { method: 'POST', body: upstream })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `ML service error: ${err}` }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'ML service is not running. Start it with: cd ml-service && python main.py' },
      { status: 503 }
    )
  }
}

export const maxDuration = 30
