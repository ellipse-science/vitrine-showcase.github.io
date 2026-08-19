'use client'

import React, { useEffect, useRef, useState } from 'react'

const REPO = 'ellipse-science/vitrine-showcase.github.io'
const MAX_B64_CHARS = 45_000 // garde une marge sous la limite de 65 535 du dispatch

// Voie de repli quand la chaîne de signalement est cassée (#335). Même adresse
// que la page « À propos » — une seule adresse publique à maintenir.
const CONTACT_EMAIL = 'capp@ulaval.ca'

type UIState = 'idle' | 'menu' | 'modal' | 'submitting' | 'success' | 'error'

// Nature de l'échec — pilote le message affiché (#335). Un 502 (la chaîne est
// cassée chez nous) n'appelle pas la même consigne qu'une coupure réseau chez
// l'utilisateur : dire « réessayez dans quelques instants » à quelqu'un dont le
// signalement ne passera pas avant réparation, c'est le renvoyer échouer.
type FailureKind = 'serveur' | 'reseau' | 'configuration'

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
  const [failureKind, setFailureKind] = useState<FailureKind | null>(null)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (uiState === 'modal') nameInputRef.current?.focus()
  }, [uiState])

  // Un brouillon qui a survécu à un envoi échoué n'est PAS écrasé quand on
  // rouvre le formulaire (#335) : c'est la seule copie du texte de la personne.
  const openModal = () => {
    if (!failureKind) setDescription('')
    setUiState('modal')
  }

  // Bouton flottant affiché uniquement sous 900px (voir .issue-fab) : le clic
  // droit / contextmenu ne se déclenche pas sur iOS Safari (aucun événement
  // `contextmenu` sur appui long), ce qui rendait le signalement impossible
  // sur ces appareils (#120). Sur desktop, le clic droit reste la seule voie
  // et suffit — c'est le contexte riche qu'on veut y garder.
  const openModalGeneric = () => {
    setReportCtx({ section: '', elementContext: '' })
    openModal()
  }

  // Ferme sans rien jeter tant qu'un envoi a échoué : le texte doit rester
  // récupérable (rouvrir le formulaire le retrouve) — c'est le cul-de-sac
  // décrit dans #335. Le brouillon n'est vidé que sur un envoi réussi ou sur un
  // abandon explicite.
  const discardDraft = () => {
    setDescription('')
    setReporterName('')
    setScreenshotFile(null)
    setScreenshotError('')
    setFailureKind(null)
    setCopied(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    // Pendant l'envoi, le bouton « Annuler » est déjà désactivé, mais le clic sur
    // l'arrière-plan, lui, passait encore. La requête, elle, continue : au retour
    // elle repassait le composant en success/error sur un modal que la personne
    // venait de fermer, et le brouillon avait déjà été jeté au passage. Tant que
    // l'envoi est en cours, fermer ne veut rien dire — on attend la réponse.
    if (uiState === 'submitting') return
    setUiState('idle')
    setCopied(false)
    if (!failureKind) discardDraft()
  }

  const handleDiscard = () => {
    setUiState('idle')
    discardDraft()
  }

  const selectFile = (file: File) => {
    setScreenshotError('')
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Fichier non supporté. Joignez une image.')
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

  // Courriel de repli pré-rempli avec ce que la personne vient d'écrire (#335).
  // La capture d'écran ne peut pas voyager dans un `mailto:` — on le dit plutôt
  // que de la perdre en silence.
  const mailtoHref = () => {
    const lignes = [
      'Ce signalement n’a pas pu être transmis depuis le site. Ce courriel prend le relais.',
      '',
      `Nom : ${reporterName.trim()}`,
      `Module : ${reportCtx.section || 'non précisé'}`,
    ]
    if (reportCtx.elementContext) lignes.push(`Contexte visible : ${reportCtx.elementContext}`)
    if (screenshotFile) lignes.push('', '(Une capture d’écran était jointe au signalement, à rattacher à ce courriel.)')
    lignes.push('', 'Description :', description.trim())
    return `mailto:${CONTACT_EMAIL}`
      + `?subject=${encodeURIComponent('Signalement — La Vitrine démocratique')}`
      + `&body=${encodeURIComponent(lignes.join('\n'))}`
  }

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(description.trim())
      setCopied(true)
    } catch {
      // Presse-papiers refusé (permission, contexte non sécurisé) : le texte
      // reste sélectionnable à la main dans l'encadré, on ne bloque pas.
      setCopied(false)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setUiState('submitting')
    setFailureKind(null)
    setCopied(false)

    let screenshot: { name: string; base64: string } | null = null
    if (screenshotFile) {
      const b64 = await compressToBase64(screenshotFile)
      if (b64) {
        const baseName = screenshotFile.name.replace(/\.[^.]+$/, '')
        screenshot = { name: `${baseName}.jpg`, base64: b64 }
      } else {
        setScreenshotError("Image trop volumineuse même après compression. Elle ne sera pas jointe.")
        setUiState('modal')
        return
      }
    }

    const dispatchUrl = process.env.NEXT_PUBLIC_DISPATCH_URL
    if (!dispatchUrl) {
      console.error('NEXT_PUBLIC_DISPATCH_URL is not configured')
      setFailureKind('configuration')
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
      if (res.ok) {
        discardDraft()
        setUiState('success')
        return
      }
      // La requête est partie et le serveur a répondu : l'échec est chez nous
      // (jeton du Worker expiré, dispatch GitHub refusé…). Réessayer plus tard
      // ne servira à rien tant que ce n'est pas réparé.
      console.error(`Dispatch du signalement refusé (HTTP ${res.status})`)
      setFailureKind('serveur')
      setUiState('error')
    } catch {
      // fetch a levé : rien n'est parti (hors ligne, DNS, CORS…). Là, réessayer
      // a du sens.
      setFailureKind('reseau')
      setUiState('error')
    }
  }

  return (
    <>
      <button
        type="button"
        className="issue-fab"
        onClick={openModalGeneric}
        aria-label="Signaler un problème"
      >
        Signaler un problème
      </button>

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
            // L'écran d'erreur est plus haut que le formulaire (texte conservé +
            // voies de repli) : sans plafond il déborde sur un petit écran et
            // les boutons deviennent inatteignables (#335).
            maxHeight: '90vh',
            overflowY: 'auto',
            boxSizing: 'border-box',
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
                <p style={label}>Envoi échoué</p>
                <h2 style={title}>
                  {failureKind === 'reseau'
                    ? 'Nous n’avons pas pu joindre le serveur'
                    : 'Le problème vient de notre côté'}
                </h2>
                <p style={dek}>
                  {failureKind === 'reseau'
                    ? 'Votre signalement n’est pas parti. Vérifiez votre connexion, puis réessayez. Votre texte est conservé.'
                    : 'Votre signalement n’a pas pu être enregistré, et réessayer n’y changera rien tant que ce n’est pas réparé. Votre texte est conservé ci-dessous : envoyez-le-nous par courriel, ou copiez-le pour le garder.'}
                </p>

                <p style={fieldLabel}>Votre signalement</p>
                {/* tabIndex + role : la boîte défile (maxHeight + overflowY) et
                    un conteneur défilant doit être atteignable au clavier —
                    sinon la fin d'un long signalement est hors de portée pour
                    qui ne peut pas faire défiler à la souris (WCAG 2.1.1). */}
                <p
                  style={draftBox}
                  tabIndex={0}
                  role="group"
                  aria-label="Votre signalement, conservé tel quel"
                >
                  {description.trim()}
                </p>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                  <a href={mailtoHref()} style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
                    Envoyer par courriel
                  </a>
                  <button onClick={copyDraft} style={secondaryBtn}>
                    {copied ? 'Texte copié ✓' : 'Copier le texte'}
                  </button>
                  <button onClick={() => setUiState('modal')} style={secondaryBtn}>
                    {failureKind === 'reseau' ? 'Réessayer' : 'Revenir au formulaire'}
                  </button>
                </div>

                <p style={{ ...fieldLabel, textTransform: 'none', letterSpacing: 0, fontFamily: "'Source Serif 4', serif", fontSize: '12px', fontStyle: 'italic', marginTop: '18px' }}>
                  Écrivez-nous à <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--cordovan)' }}>{CONTACT_EMAIL}</a>.
                  {screenshotFile && ' Pensez à rattacher votre capture d’écran au courriel : elle ne peut pas être jointe automatiquement.'}
                </p>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                  <button onClick={handleDiscard} style={discardBtn}>Abandonner</button>
                  <button onClick={handleClose} style={btn}>Fermer</button>
                </div>
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
                  placeholder="Ex&nbsp;: l'image ne correspond pas, le score semble erroné…"
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

// Sortie discrète : jeter son propre texte ne doit jamais avoir le poids visuel
// d'une action recommandée.
const discardBtn: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '9px',
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-softer)',
  background: 'none',
  border: 'none',
  padding: '10px 0',
  cursor: 'pointer',
  textDecoration: 'underline',
  flexShrink: 0,
}

const secondaryBtn: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '10px',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--ink-softer)',
  background: 'none',
  border: '0.5px solid var(--rule)',
  padding: '10px 20px',
  cursor: 'pointer',
}

// Le texte échoué, rendu visible et sélectionnable : c'est la seule copie que
// la personne possède tant que la chaîne est cassée (#335).
const draftBox: React.CSSProperties = {
  fontFamily: "'Source Serif 4', serif",
  fontSize: '14px',
  lineHeight: 1.5,
  color: 'var(--ink)',
  background: 'var(--paper-deep)',
  border: '0.5px solid var(--rule)',
  padding: '12px',
  margin: '0',
  maxHeight: '140px',
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  userSelect: 'text',
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
