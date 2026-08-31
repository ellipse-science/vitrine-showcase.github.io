package science.ellipse.vitrine

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import kotlin.concurrent.thread

/**
 * Tuile d'écran d'accueil : la Une du bloc courant.
 *
 * Elle lit les deux petits fichiers publics servis par le CDN
 * (`hero-selection.json`, ~330 octets, et `build-id.json`, ~100 octets).
 * Jamais l'API : une tuile sur des milliers d'appareils qui interrogerait Neon
 * est exactement le scénario d'egress qui a coûté 5 Go en août.
 */
class VitrineWidget : AppWidgetProvider() {

    override fun onUpdate(
        contexte: Context,
        gestionnaire: AppWidgetManager,
        identifiants: IntArray,
    ) {
        // `goAsync` tient le récepteur en vie le temps de la lecture réseau,
        // qui est interdite sur le fil principal.
        val enAttente = goAsync()
        thread {
            try {
                val une = Lecteur.lire(Vitrine.UNE_COURANTE)?.let(UneCourante::depuisJson)
                val build = Lecteur.lire(Vitrine.IDENTIFIANT_BUILD)?.let(IdentifiantBuild::depuisJson)
                identifiants.forEach { id ->
                    gestionnaire.updateAppWidget(id, dessiner(contexte, une, build))
                }
            } finally {
                enAttente.finish()
            }
        }
    }

    private fun dessiner(
        contexte: Context,
        une: UneCourante?,
        build: IdentifiantBuild?,
    ): RemoteViews = RemoteViews(contexte.packageName, R.layout.widget_une).apply {
        val enjeu = Enjeux.libelle(une?.enjeu)
        setTextViewText(R.id.widget_enjeu, enjeu ?: contexte.getString(R.string.widget_titre))
        setInt(R.id.widget_pastille, "setColorFilter", Enjeux.couleur(une?.enjeu))
        setTextViewText(
            R.id.widget_titre,
            une?.titre ?: contexte.getString(R.string.widget_indisponible),
        )

        val construitLe = build?.construitLe
        if (construitLe != null) {
            setViewVisibility(R.id.widget_fraicheur, View.VISIBLE)
            setTextViewText(
                R.id.widget_fraicheur,
                Formats.fraicheur(construitLe, System.currentTimeMillis()),
            )
        } else {
            setViewVisibility(R.id.widget_fraicheur, View.GONE)
        }

        // Toucher la tuile ouvre l'application.
        val ouvrir = Intent(contexte, MainActivity::class.java)
        setOnClickPendingIntent(
            R.id.widget_racine,
            PendingIntent.getActivity(
                contexte,
                0,
                ouvrir,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        )
    }
}
