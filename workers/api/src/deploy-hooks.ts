/** Déclenchement des builds du site : GitHub Actions quand le Worker porte
 *  son jeton, sinon les Deploy Hooks de Cloudflare Pages.
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
  /** Jeton GitHub à grain fin — Actions en lecture et écriture, sur ce seul
   *  dépôt. Présent, le Worker lance lui-même les builds GitHub. */
  GITHUB_DISPATCH_TOKEN?: string
}

/** LES BUILDS QUI ABOUTISSENT (10-09). `wrangler pages deploy` depuis GitHub
 *  Actions met le site en ligne en ~5 min. Les builds Cloudflare Pages lancés
 *  par les Deploy Hooks, eux, se figent après le clone et sont tués à ~36 min
 *  (« build exceeded the time limit ») : prod, dev et previews finissent tous
 *  en « No deployment available ». Le Worker synchronisait à l'heure et aucun
 *  build ne suivait — seul le filet GitHub livrait, une heure plus tard.
 *
 *  `ref` : deploy-prod.yml extrait `main` quoi qu'on lui passe (c'est aussi la
 *  ref que lui donne refresh-data.yml) ; deploy-dev-cloudflare.yml extrait la
 *  ref du déclenchement, donc `develop`. */
export const BUILDS_GITHUB = [
  { nom: 'prod', workflow: 'deploy-prod.yml', ref: 'main' },
  { nom: 'dev', workflow: 'deploy-dev-cloudflare.yml', ref: 'develop' },
] as const

const DEPOT = 'ellipse-science/vitrine-showcase.github.io'

export async function triggerDeployHooks(env: DeployHookEnv): Promise<void> {
  // AVEC LE JETON, GITHUB SEULEMENT. Les hooks ne sont plus appelés : un build
  // Cloudflare figé occupe 36 min l'unique place de build du compte (plan
  // gratuit), previews comprises, pour ne rien livrer.
  if (env.GITHUB_DISPATCH_TOKEN) return lancerBuildsGithub(env.GITHUB_DISPATCH_TOKEN)

  const hooks: [string, string | undefined][] = [
    ['prod', env.DEPLOY_HOOK_PROD],
    ['dev', env.DEPLOY_HOOK_DEV],
  ]
  // DEUX CIRCUITS appellent cette fonction à quelques minutes d'intervalle :
  // le sync Athena (index.ts, minutes :53 et :10) et la publication de
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

async function lancerBuildsGithub(jeton: string): Promise<void> {
  // Chaque build a sa chance, comme pour les hooks : un refus sur prod ne doit
  // pas priver dev de son build, et l'appelant reçoit un rapport unique.
  const echecs: string[] = []
  for (const { nom, workflow, ref } of BUILDS_GITHUB) {
    try {
      const res = await fetch(`https://api.github.com/repos/${DEPOT}/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jeton}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'vitrine-api-worker', // GitHub refuse toute requête sans agent
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({ ref }),
      })
      if (res.status === 204) console.log(`build GitHub ${nom} lancé (${workflow})`)
      else echecs.push(`${nom} : GitHub a répondu ${res.status}`)
    } catch (err) {
      echecs.push(`${nom} : GitHub injoignable (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  if (echecs.length > 0) throw new Error(`Build GitHub : ${echecs.join(' ; ')}`)
}
