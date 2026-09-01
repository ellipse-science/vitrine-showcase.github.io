package science.ellipse.vitrine

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * Adresses publiques du site. Tout est servi par le CDN Cloudflare, jamais par
 * l'API : c'est la règle de coût nul sous afflux du projet. L'application, comme
 * le site, ne parle jamais à api.vitrinedemocratique.com.
 */
object Vitrine {
    const val SITE = "https://vitrinedemocratique.com/"

    /** Identifiant de build, réécrit à chaque déploiement (~100 octets). */
    const val IDENTIFIANT_BUILD = "https://vitrinedemocratique.com/build-id.json"

    /** La Une du bloc courant (~330 octets), source de la tuile d'écran d'accueil. */
    const val UNE_COURANTE = "https://vitrinedemocratique.com/data/hero-selection.json"

    /**
     * Une navigation reste dans l'application si elle vise le site lui-même.
     * Tout le reste part vers un onglet Chrome.
     *
     * Liste explicite plutôt qu'un `endsWith(".vitrinedemocratique.com")` :
     * ce raccourci classerait `api.vitrinedemocratique.com` comme interne et
     * autoriserait la vue web à y naviguer, en contradiction avec la règle
     * « jamais l'API ». Il laisserait aussi passer `dev.`, qui est derrière
     * Cloudflare Access.
     *
     * `java.net.URI` et non `android.net.Uri` : la seconde est un talon inerte
     * dans les tests unitaires du JVM, ce qui rendrait justement cette
     * fonction-ci intestable.
     */
    fun estInterne(url: String?): Boolean {
        val hote = hote(url) ?: return false
        return hote == "vitrinedemocratique.com" || hote == "www.vitrinedemocratique.com"
    }

    /** Les schémas que la vue web sait traiter elle-même. */
    fun estSchemaWeb(url: String?): Boolean {
        val schema = runCatching { URI(url ?: return false).scheme }.getOrNull()?.lowercase()
        return schema == "http" || schema == "https"
    }

    private fun hote(url: String?): String? =
        runCatching { URI(url ?: return null).host }.getOrNull()?.lowercase()
}

/**
 * La Une publiée pour le bloc courant.
 *
 * NB : le fichier porte `time_interval_utc` (« 07-11 »), volontairement ignoré
 * ici. Le site étiquette ses éditions à l'heure de Montréal ; réafficher les
 * bornes UTC telles quelles ferait mentir la tuile à côté de la page.
 */
data class UneCourante(
    val titre: String,
    val enjeu: String?,
) {
    companion object {
        fun depuisJson(brut: String): UneCourante? = runCatching {
            val o = JSONObject(brut)
            UneCourante(
                titre = o.getString("title"),
                enjeu = o.optString("main_issue").ifBlank { null },
            )
        }.getOrNull()
    }
}

data class IdentifiantBuild(
    val id: String,
    val construitLe: Long?,
) {
    companion object {
        fun depuisJson(brut: String): IdentifiantBuild? = runCatching {
            val o = JSONObject(brut)
            IdentifiantBuild(
                id = o.getString("id"),
                construitLe = o.optString("builtAt").ifBlank { null }?.let(Formats::instantIso),
            )
        }.getOrNull()
    }
}

object Formats {
    /** « 2026-08-28T12:14:08.195Z » vers un instant en millisecondes. */
    fun instantIso(brut: String): Long? = runCatching {
        java.time.Instant.parse(brut).toEpochMilli()
    }.getOrNull()

    /**
     * « à l'instant », « il y a 3h », « hier », « il y a 2 jours ».
     * Heures collées au chiffre (`3h`), écart assumé à l'OQLF suivi par le projet.
     */
    fun fraicheur(depuisMs: Long, maintenantMs: Long): String {
        val heures = ((maintenantMs - depuisMs).coerceAtLeast(0)) / 3_600_000
        return when {
            heures < 1 -> "à l'instant"
            heures < 24 -> "il y a ${heures}h"
            heures < 48 -> "hier"
            else -> "il y a ${heures / 24} jours"
        }
    }
}

/** Lecture réseau commune à l'application et à la tuile. */
object Lecteur {
    fun lire(adresse: String): String? = runCatching {
        val connexion = (URL(adresse).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15_000
            readTimeout = 15_000
            // Ces fichiers changent à chaque déploiement : jamais de cache,
            // sinon la sonde de fraîcheur se compare à elle-même.
            setRequestProperty("Cache-Control", "no-cache")
        }
        try {
            if (connexion.responseCode !in 200..299) return null
            connexion.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connexion.disconnect()
        }
    }.getOrNull()
}
