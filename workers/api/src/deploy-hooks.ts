/** Déclenchement des builds Cloudflare Pages.
 *
 *  Module SÉPARÉ de sync-athena.ts À DESSEIN : ce dernier importe
 *  `@neondatabase/serverless` et `aws4fetch`, absents de la compilation
 *  racine — un test qui l'importerait casserait `npm run type-check`, donc
 *  toutes les PR et les déploiements (même leçon que `transforms.ts`).
 *  Ici : aucune dépendance, donc testable directement.
 */
export interface DeployHookEnv {
  DEPLOY_HOOK_PROD?: string
  DEPLOY_HOOK_DEV?: string
}

export async function triggerDeployHooks(env: DeployHookEnv): Promise<void> {
  const hooks: [string, string | undefined][] = [
    ['prod', env.DEPLOY_HOOK_PROD],
    ['dev', env.DEPLOY_HOOK_DEV],
  ]
  // DEUX CIRCUITS appellent cette fonction à quelques minutes d'intervalle :
  // le sync Athena de la minute :10 (index.ts) et la publication de
  // l'illustration de la Une (art.ts, actif depuis le 2026-08-23). Cloudflare
  // répond alors 304 au second : « un déploiement est déjà en file pour cette
  // branche, rien à faire ». Ce n'est PAS un échec — c'est même la preuve que
  // le premier appel a été pris. L'ancienne version levait dessus, et comme
  // `prod` est appelé en premier, l'exception emportait AUSSI le build `dev`.
  // Vécu : #570, alerte « Deploy hook prod a répondu 304 » du 24 août 8h12,
  // prod figée sur l'édition de la veille jusqu'au 25 août midi.
  //
  // Les échecs sont donc collectés, jamais propagés en cours de route : chaque
  // hook a sa chance, et l'appelant reçoit un rapport unique à la fin.
  const echecs: string[] = []
  for (const [name, url] of hooks) {
    if (!url) {
      console.warn(`hook ${name} absent : aucun build déclenché pour ${name}`)
      continue
    }
    try {
      const res = await fetch(url, { method: 'POST' })
      if (res.status === 304) {
        console.log(`hook ${name} : 304, un déploiement est déjà en file — rien à relancer`)
      } else if (res.status >= 300) {
        echecs.push(`${name} a répondu ${res.status}`)
      } else {
        console.log(`hook ${name} déclenché`)
      }
    } catch (err) {
      echecs.push(`${name} injoignable (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  if (echecs.length > 0) throw new Error(`Deploy hook : ${echecs.join(' ; ')}`)
}
