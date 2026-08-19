// Client Athena minimal pour Workers : signatures SigV4 (aws4fetch), cycle
// StartQueryExecution -> GetQueryExecution (attente) -> GetQueryResults
// (pages de 1000 lignes).
//
// Les clés employées sont celles de LECTURE des datamarts, les mêmes que
// `tube`/`fetch_data.R` utilisent depuis des années : AWS reste une source
// passive interrogée en lecture, aucune permission nouvelle n'est requise
// (directive d'émancipation du 2026-08-19 : la chaîne planifiée vit chez
// Cloudflare, cf. docs/superpowers/specs/2026-08-19-emancipation-totale-design.md).
import { AwsClient } from 'aws4fetch'

export interface AthenaConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
  database: string
  outputLocation: string
}

interface StartResponse {
  QueryExecutionId: string
}

interface ExecutionResponse {
  QueryExecution?: {
    Status?: { State?: string; StateChangeReason?: string }
  }
}

interface ResultsResponse {
  ResultSet?: { Rows?: { Data?: { VarCharValue?: string }[] }[] }
  NextToken?: string
}

export class AthenaClient {
  private aws: AwsClient
  private endpoint: string

  constructor(private cfg: AthenaConfig) {
    this.aws = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: 'athena',
    })
    this.endpoint = `https://athena.${cfg.region}.amazonaws.com/`
  }

  private async call<T>(target: string, body: unknown): Promise<T> {
    const res = await this.aws.fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AmazonAthena.${target}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Athena ${target} : HTTP ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as T
  }

  async start(query: string): Promise<string> {
    const res = await this.call<StartResponse>('StartQueryExecution', {
      QueryString: query,
      QueryExecutionContext: { Database: this.cfg.database },
      ResultConfiguration: { OutputLocation: this.cfg.outputLocation },
    })
    return res.QueryExecutionId
  }

  /** Attend la fin d'exécution. Athena répond en 1 à 5 s sur ces tables ;
   *  le délai n'est que du temps d'horloge (aucun coût CPU Worker). */
  async waitUntilDone(id: string, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const res = await this.call<ExecutionResponse>('GetQueryExecution', {
        QueryExecutionId: id,
      })
      const state = res.QueryExecution?.Status?.State ?? 'UNKNOWN'
      if (state === 'SUCCEEDED') return
      if (state === 'FAILED' || state === 'CANCELLED') {
        const reason = res.QueryExecution?.Status?.StateChangeReason ?? state
        throw new Error(`Requête Athena ${id} : ${reason}`)
      }
      if (Date.now() > deadline) {
        throw new Error(`Requête Athena ${id} : délai dépassé (${timeoutMs} ms)`)
      }
      await new Promise((r) => setTimeout(r, 700))
    }
  }

  /** Itère les lignes de résultat, page par page (jamais la table entière en
   *  mémoire à cette étape). La PREMIÈRE ligne de la première page est
   *  l'en-tête de colonnes : sautée. Valeur absente = NULL. */
  async *rows(id: string): AsyncGenerator<(string | null)[]> {
    let token: string | undefined
    let first = true
    do {
      const body: Record<string, unknown> = { QueryExecutionId: id, MaxResults: 1000 }
      if (token) body.NextToken = token
      const res = await this.call<ResultsResponse>('GetQueryResults', body)
      const pageRows = res.ResultSet?.Rows ?? []
      for (let i = 0; i < pageRows.length; i++) {
        if (first && i === 0) continue
        yield (pageRows[i].Data ?? []).map((d) => d.VarCharValue ?? null)
      }
      first = false
      token = res.NextToken
    } while (token)
  }
}
