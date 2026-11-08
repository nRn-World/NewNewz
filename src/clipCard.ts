export type ClipInput = {
  title: string
  summary?: string
  source: string
  place: string
  dateStr: string
  url: string
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
      if (lines.length >= maxLines - 1) break
    } else {
      line = test
    }
  }
  if (line && lines.length < maxLines) {
    const idx = words.indexOf(line.split(' ')[0])
    const rest = words.slice(Math.max(0, idx)).join(' ')
    if (ctx.measureText(rest).width > maxWidth && lines.length === maxLines - 1) {
      let trimmed = line
      while (trimmed.length > 3 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1)
      }
      lines.push(`${trimmed}…`)
    } else {
      lines.push(line)
    }
  }
  return lines
}

export async function exportClipCard(item: ClipInput): Promise<void> {
  const W = 1080
  const H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Outer dark backdrop
  ctx.fillStyle = '#14100b'
  ctx.fillRect(0, 0, W, H)

  // Red broadsheet offset shadow
  ctx.fillStyle = '#c8321e'
  ctx.fillRect(62, 62, W - 104, H - 104)

  // Aged newsprint card
  const x0 = 48
  const y0 = 48
  const cw = W - 104
  const ch = H - 104
  ctx.fillStyle = '#f2e6cb'
  ctx.fillRect(x0, y0, cw, ch)

  // Subtle horizontal paper grain
  ctx.strokeStyle = 'rgba(20,16,11,0.035)'
  ctx.lineWidth = 1
  for (let y = y0 + 8; y < y0 + ch; y += 6) {
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + cw, y)
    ctx.stroke()
  }

  // Outer & inner ink borders
  ctx.strokeStyle = '#14100b'
  ctx.lineWidth = 5
  ctx.strokeRect(x0, y0, cw, ch)
  ctx.lineWidth = 1.5
  ctx.strokeRect(x0 + 14, y0 + 14, cw - 28, ch - 28)

  const padX = x0 + 64
  const innerW = cw - 128

  // Masthead
  ctx.fillStyle = '#14100b'
  ctx.textAlign = 'center'
  ctx.font = '900 66px "Alfa Slab One", "Playfair Display", Georgia, serif'
  ctx.fillText('NewzLocal', x0 + cw / 2, y0 + 112)

  // Double rule under masthead
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(padX, y0 + 138)
  ctx.lineTo(padX + innerW, y0 + 138)
  ctx.stroke()
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(padX, y0 + 146)
  ctx.lineTo(padX + innerW, y0 + 146)
  ctx.stroke()

  // Dateline: PLACE · DATE
  ctx.textAlign = 'left'
  ctx.fillStyle = '#c8321e'
  ctx.font = '700 24px "Courier Prime", monospace'
  const dateline = `${item.place.toUpperCase()}  ·  ${item.dateStr.toUpperCase()}`
  ctx.fillText(dateline.slice(0, 56), padX, y0 + 194)

  // Headline
  ctx.fillStyle = '#14100b'
  const titleFontSize = item.title.length > 110 ? 44 : item.title.length > 70 ? 50 : 58
  ctx.font = `700 ${titleFontSize}px "Playfair Display", "Fraunces", Georgia, serif`
  const titleLines = wrapLines(ctx, item.title, innerW, 6)
  let cy = y0 + 272
  for (const l of titleLines) {
    ctx.fillText(l, padX, cy)
    cy += Math.round(titleFontSize * 1.24)
  }

  // Optional summary excerpt
  if (item.summary) {
    cy += 18
    ctx.fillStyle = '#3a3023'
    ctx.font = '400 30px "Old Standard TT", Georgia, serif'
    const maxSumLines = Math.max(2, Math.floor((y0 + ch - 180 - cy) / 40))
    const sumLines = wrapLines(ctx, item.summary, innerW, Math.min(5, maxSumLines))
    for (const sl of sumLines) {
      ctx.fillText(sl, padX, cy)
      cy += 40
    }
  }

  // Bottom rule & source credit
  const footY = y0 + ch - 76
  ctx.strokeStyle = '#14100b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(padX, footY - 38)
  ctx.lineTo(padX + innerW, footY - 38)
  ctx.stroke()

  ctx.fillStyle = '#14100b'
  ctx.font = '700 24px "Courier Prime", monospace'
  ctx.textAlign = 'left'
  ctx.fillText((item.source || 'Local Press').toUpperCase().slice(0, 34), padX, footY)

  ctx.fillStyle = '#6b5f4d'
  ctx.textAlign = 'right'
  ctx.font = '400 22px "Courier Prime", monospace'
  ctx.fillText('NEWZLOCAL DISPATCH', padX + innerW, footY)

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return
  const slug = item.place.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story'
  const fileName = `newzlocal-${slug}.png`
  const file = new File([blob], fileName, { type: 'image/png' })

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: item.title,
        text: `${item.title} — ${item.place}`,
        url: item.url,
      })
      return
    } catch {
      /* user cancelled or share failed; fall back to download */
    }
  }

  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
}
