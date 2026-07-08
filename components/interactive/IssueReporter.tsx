'use client'

import React, { useEffect, useRef, useState } from 'react'

const REPO = 'ellipse-science/vitrine-showcase.github.io'
const MAX_B64_CHARS = 45_000 // garde une marge sous la limite de 65 535 du dispatch

type UIState = 'idle' | 'menu' | 'modal' | 'submitting' | 'success' | 'error'

interface ReportContext {
  section: string
  elementContext: string
}

async function compressToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 800
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      // Start at quality 0.65 and reduce by 30% each iteration until it fits the payload budget
      let quality = 0.65
      let b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1]
      while (b64.length > MAX_B64_CHARS && quality > 0.1) {
        quality = Math.round(quality * 100 * 0.7) / 100
        b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1]
      }
      resolve(b64.length <= MAX_B64_CHARS ? b64 : null)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

export function IssueReporter() {
  const [uiState, setUiState] = useState<UIState>('idle')
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [reportCtx, setReportCtx] = useState<ReportContext>({ section: '', elementContext: '' })
  const [description, setDescription] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotError, setScreenshotError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      if (!e.target) return

      // WebKit/Safari text node fix
      const targetNode = e.target as Node
      const targetEl = targetNode.nodeType === Node.TEXT_NODE
        ? (targetNode.parentNode as Element)
        : (targetNode as Element)

      if (!targetEl) return

      let el: Element | null = targetEl
      let section = ''
      while (el && el !== document.body) {
        const s = el.getAttribute('data-section')
        if (s) { section = s; break }
        el = el.parentElement
      }

      const elementContext = (targetEl.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      setReportCtx({ section, elementContext })
      setMenuPos({ x: e.clientX, y: e.clientY })
      setUiState('menu')
    }

    const handleClick = (e: MouseEvent) => {
      if (!e.target) return
      const targetNode = e.target as Node
      const targetEl = targetNode.nodeType === Node.TEXT_NODE
        ? (targetNode.parentNode as Element)
        : (targetNode as Element)

      if (targetEl && targetEl.classList && (targetEl.classList.contains('footer-report-btn') || (typeof targetEl.closest === 'function' && targetEl.closest('.footer-report-btn')))) {
        e.preventDefault()
        setReportCtx({ section: 'Pied de page', elementContext: 'Bouton de signalement du pied de page' })
        setDescription('')
        setUiState('modal')
        return
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUiState(prev => prev === 'menu' ? 'idle' : prev)
      }
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClick)
    }
  }, [])

  useEffect(() => {
    if (uiState === 'modal') nameInputRef.current?.focus()
  }, [uiState])

  const openModal = () => {
    setDescription('')
    setUiState('modal')
  }

  const handleClose = () => {
    setUiState('idle')
    setDescription('')
    setReporterName('')
    setScreenshotFile(null)
    setScreenshotError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const selectFile = (file: File) => {
    setScreenshotError('')
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Fichier non supporté — joignez une image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setScreenshotError('Image trop volumineuse (max 10 Mo).')
      return
    }
    setScreenshotFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) selectFile(file)
  }

  useEffect(() => {
    if (uiState !== 'modal') return
    const handlePaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i =>
        i.type.startsWith('image/')
      )
      if (!item) return
      const file = item.getAsFile()
      if (file) {
        const named = new File([file], `capture-${Date.now()}.png`, { type: file.type })
        selectFile(named)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState])

  const removeFile = () => {
    setScreenshotFile(null)
    setScreenshotError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const canSubmit = description.trim().length > 0 && reporterName.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setUiState('submitting')

    let screenshot: { name: string; base64: string } | null = null
    if (screenshotFile) {
      const b64 = await compressToBase64(screenshotFile)
      if (b64) {
        const baseName = screenshotFile.name.replace(/\.[^.]+$/, '')
        screenshot = { name: `${baseName}.jpg`, base64: b64 }
      } else {
        setScreenshotError("Image trop volumineuse même après compression — elle ne sera pas jointe.")
        setUiState('modal')
        return
      }
    }

    const dispatchUrl = process.env.NEXT_PUBLIC_DISPATCH_URL
    if (!dispatchUrl) {
      console.error('NEXT_PUBLIC_DISPATCH_URL is not configured')
      setUiState('error')
      return
    }

    try {
      const res = await fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'report-issue',
          client_payload: {
            description: description.trim(),
            section: reportCtx.section,
            elementContext: reportCtx.elementContext,
            reporterName: reporterName.trim(),
            screenshot,
          },
        }),
      })
      setUiState(res.ok ? 'success' : 'error')
    } catch {
      setUiState('error')
    }
  }

  if (uiState === 'idle') return null

  return (
    <>
      {uiState === 'menu' && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.y,
            left: menuPos.x,
            zIndex: 9999,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            boxShadow: '0 2px 12px rgba(28,25,23,0.14)',
            padding: '4px 0',
            minWidth: '190px',
          }}
        >
          <button
            onClick={openModal}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-deep)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            style={{
              display: 'block',
              width: '100%',
              padding: '9px 14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--cordovan)',
            }}
          >
            Signaler un problème
          </button>
        </div>
      )}

      {(uiState === 'modal' || uiState === 'submitting' || uiState === 'success' || uiState === 'error') && (
        <div
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,25,23,0.45)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            padding: '40px 48px',
            maxWidth: '520px',
            width: '90%',
          }}>

            {uiState === 'success' && (
              <>
                <p style={label}>Signalement reçu</p>
                <h2 style={title}>Merci pour votre retour.</h2>
                <p style={dek}>Votre signalement a été transmis à l&apos;équipe et sera traité dans les prochains jours.</p>
                <button onClick={handleClose} style={btn}>Fermer</button>
              </>
            )}

            {uiState === 'error' && (
              <>
                <p style={label}>Erreur</p>
                <h2 style={title}>Envoi échoué</h2>
                <p style={dek}>Une erreur est survenue. Réessayez dans quelques instants.</p>
                <button onClick={handleClose} style={btn}>Fermer</button>
              </>
            )}

            {(uiState === 'modal' || uiState === 'submitting') && (
              <>
                <p style={label}>{reportCtx.section || 'La Vitrine'}</p>
                <h2 style={title}>Signaler un problème</h2>
                <p style={dek}>Décrivez ce que vous avez observé. Votre signalement sera revu par l&apos;équipe.</p>
                <label htmlFor="reporter-name" style={fieldLabel}>Votre nom</label>
                <input
                  id="reporter-name"
                  ref={nameInputRef}
                  type="text"
                  value={reporterName}
                  onChange={e => setReporterName(e.target.value)}
                  disabled={uiState === 'submitting'}
                  placeholder="Prénom et nom"
                  style={{
                    width: '100%',
                    fontFamily: "'Source Serif 4', serif",
                    fontSize: '14px',
                    lineHeight: 1.5,
                    color: 'var(--ink)',
                    background: 'var(--paper-deep)',
                    border: '0.5px solid var(--rule)',
                    padding: '10px 12px',
                    boxSizing: 'border-box',
                    marginBottom: '16px',
                    outline: 'none',
                  }}
                />
                <p style={fieldLabel}>Description</p>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  disabled={uiState === 'submitting'}
                  placeholder="Ex : l'image ne correspond pas, le score semble erroné…"
                  style={{
                    width: '100%',
                    minHeight: '110px',
                    fontFamily: "'Source Serif 4', serif",
                    fontSize: '14px',
                    lineHeight: 1.5,
                    color: 'var(--ink)',
                    background: 'var(--paper-deep)',
                    border: '0.5px solid var(--rule)',
                    padding: '12px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    marginBottom: '16px',
                    outline: 'none',
                  }}
                />

                {/* Pièce jointe */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                {!screenshotFile ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uiState === 'submitting'}
                    style={attachBtn}
                  >
                    Coller (Ctrl+V) ou choisir une image
                  </button>
                ) : (
                  <div style={attachedRow}>
                    <span style={attachedName} title={screenshotFile.name}>
                      📎 {screenshotFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={removeFile}
                      disabled={uiState === 'submitting'}
                      aria-label="Retirer la capture d'écran"
                      style={removeBtn}
                    >
                      ×
                    </button>
                  </div>
                )}
                {screenshotError && (
                  <p style={{ ...fieldLabel, color: 'var(--cordovan)', marginTop: '4px' }}>
                    {screenshotError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button
                    onClick={handleClose}
                    disabled={uiState === 'submitting'}
                    style={{ ...btn, background: 'none', color: 'var(--ink-softer)', border: '0.5px solid var(--rule)' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || uiState === 'submitting'}
                    style={{ ...btn, opacity: !canSubmit || uiState === 'submitting' ? 0.45 : 1 }}
                  >
                    {uiState === 'submitting' ? 'Envoi…' : 'Envoyer →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const label: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '10px',
  fontWeight: 500,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: 'var(--cordovan)',
  margin: '0 0 16px',
}

const title: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '-0.3px',
  lineHeight: 1.15,
  color: 'var(--ink)',
  margin: '0 0 12px',
}

const dek: React.CSSProperties = {
  fontFamily: "'Source Serif 4', serif",
  fontSize: '15px',
  fontStyle: 'italic',
  color: 'var(--ink-soft)',
  lineHeight: 1.45,
  margin: '0 0 24px',
}

const fieldLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '9px',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--ink-softer)',
  margin: '0 0 6px',
}

const btn: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '10px',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--paper)',
  background: 'var(--cordovan)',
  border: 'none',
  padding: '10px 20px',
  cursor: 'pointer',
}

const attachBtn: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '9px',
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--ink-softer)',
  background: 'none',
  border: '0.5px dashed var(--rule)',
  padding: '8px 14px',
  cursor: 'pointer',
  width: '100%',
}

const attachedRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  border: '0.5px solid var(--rule)',
  padding: '8px 12px',
  background: 'var(--paper-deep)',
}

const attachedName: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '10px',
  color: 'var(--ink-soft)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const removeBtn: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '14px',
  lineHeight: 1,
  color: 'var(--ink-softer)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 2px',
  flexShrink: 0,
}
