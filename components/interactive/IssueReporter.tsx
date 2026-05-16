'use client'

import React, { useEffect, useRef, useState } from 'react'

const REPO = 'ellipse-science/vitrine-showcase.github.io'

type UIState = 'idle' | 'menu' | 'modal' | 'submitting' | 'success' | 'error'

interface ReportContext {
  section: string
  elementContext: string
}

export function IssueReporter() {
  const [uiState, setUiState] = useState<UIState>('idle')
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [reportCtx, setReportCtx] = useState<ReportContext>({ section: '', elementContext: '' })
  const [description, setDescription] = useState('')
  const [reporterName, setReporterName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const target = e.target as Element

      let el: Element | null = target
      let section = ''
      while (el && el !== document.body) {
        const s = el.getAttribute('data-section')
        if (s) { section = s; break }
        el = el.parentElement
      }

      const elementContext = (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      setReportCtx({ section, elementContext })
      setMenuPos({ x: e.clientX, y: e.clientY })
      setUiState('menu')
    }

    const handleClick = (e: MouseEvent) => {
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
    if (uiState === 'modal') textareaRef.current?.focus()
  }, [uiState])

  const openModal = () => {
    setDescription('')
    setUiState('modal')
  }

  const handleClose = () => {
    setUiState('idle')
    setDescription('')
    setReporterName('')
  }

  const canSubmit = description.trim().length > 0 && reporterName.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setUiState('submitting')
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DISPATCH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'report-issue',
          client_payload: {
            description: description.trim(),
            section: reportCtx.section,
            elementContext: reportCtx.elementContext,
            reporterName: reporterName.trim(),
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
                <p style={fieldLabel}>Votre nom</p>
                <input
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
                    marginBottom: '20px',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
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
